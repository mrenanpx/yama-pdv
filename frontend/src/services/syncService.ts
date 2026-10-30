import { supabase } from '../supabaseClient';
import { dbLocal, type LocalVenda, type LocalSessao } from '../db/localDb';

export type SyncStatusType = 'online' | 'offline' | 'syncing';

export interface SyncState {
  status: SyncStatusType;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
}

type SyncListener = (state: SyncState) => void;

class SyncService {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private pendingCount: number = 0;
  private lastSyncAt: Date | null = null;
  private listeners: Set<SyncListener> = new Set();
  private intervalId: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      
      // Checagem periódica a cada 20 segundos
      this.intervalId = setInterval(() => {
        this.verificarEAtualizar();
      }, 20000);

      // Verificação inicial
      setTimeout(() => {
        this.verificarEAtualizar();
      }, 1000);
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): SyncState {
    let status: SyncStatusType = 'online';
    if (!this.isOnline) {
      status = 'offline';
    } else if (this.isSyncing) {
      status = 'syncing';
    }

    return {
      status,
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncAt: this.lastSyncAt,
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error('Erro no listener de sincronização:', e);
      }
    });
  }

  private async handleNetworkChange(online: boolean) {
    this.isOnline = online;
    this.notify();
    if (online) {
      await this.sincronizar();
    }
  }

  public async contarPendentes(): Promise<number> {
    try {
      const pendentesVendas = await dbLocal.vendas.where('sync_status').equals('pending').count();
      const pendentesSessoes = await dbLocal.sessoes.where('sync_status').equals('pending').count();
      const pendentesUploads = await dbLocal.storageQueue.count();
      this.pendingCount = pendentesVendas + pendentesSessoes + pendentesUploads;
      return this.pendingCount;
    } catch {
      return 0;
    }
  }

  public async testarConexao(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnline = false;
      return false;
    }

    try {
      // Teste leve com timeout de 3 segundos para garantir que a rede responde
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // Faz um teste rápido de ping para o Supabase
      const { error } = await supabase.from('caixa_sessoes').select('id').limit(1).abortSignal(controller.signal);
      clearTimeout(timeoutId);

      this.isOnline = !error || error.code !== 'PGRST301';
      return this.isOnline;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  public async verificarEAtualizar() {
    await this.contarPendentes();
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }
    this.notify();

    if (this.isOnline && this.pendingCount > 0 && !this.isSyncing) {
      await this.sincronizar();
    }
  }

  public async sincronizar(): Promise<{ sucesso: boolean; sincronizados: number; erro?: string }> {
    if (this.isSyncing) {
      return { sucesso: true, sincronizados: 0 };
    }

    const conectado = await this.testarConexao();
    if (!conectado) {
      this.notify();
      return { sucesso: false, sincronizados: 0, erro: 'Sem conexão com a internet.' };
    }

    this.isSyncing = true;
    this.notify();

    let totalSincronizados = 0;

    try {
      // 1. Sincronizar Sessões Pendentes
      const sessoesPendentes = await dbLocal.sessoes.where('sync_status').equals('pending').toArray();
      for (const sessao of sessoesPendentes) {
        try {
          const payload = {
            id: sessao.id,
            unidade: sessao.unidade,
            status: sessao.status,
            troco_inicial: sessao.troco_inicial,
            caixa_2_ativo: sessao.caixa_2_ativo,
            aberto_em: sessao.aberto_em,
            ...(sessao.fechado_em ? { fechado_em: sessao.fechado_em } : {}),
            ...(sessao.repasse_caixa_2 !== undefined ? { repasse_caixa_2: sessao.repasse_caixa_2 } : {})
          };

          const { error } = await supabase.from('caixa_sessoes').upsert(payload);
          if (!error) {
            await dbLocal.sessoes.update(sessao.id, { sync_status: 'synced' });
            totalSincronizados++;
          }
        } catch (e) {
          console.error('Erro ao sincronizar sessão:', sessao.id, e);
        }
      }

      // 2. Sincronizar Vendas Pendentes (Inserts e Cancelamentos)
      const vendasPendentes = await dbLocal.vendas.where('sync_status').equals('pending').toArray();
      for (const venda of vendasPendentes) {
        try {
          if (venda.sync_action === 'cancel') {
            const { error } = await supabase
              .from('vendas')
              .update({ forma_pagto: 'CANCELADO', observacao: venda.observacao })
              .eq('id', venda.id);

            if (!error) {
              await dbLocal.vendas.update(venda.id, { sync_status: 'synced', sync_action: undefined });
              totalSincronizados++;
            }
          } else {
            // Inserção normal
            const payload = {
              id: venda.id,
              sessao_id: venda.sessao_id,
              unidade: venda.unidade,
              numero_sequencial: venda.numero_sequencial,
              setor: venda.setor,
              valor: venda.valor,
              quantidade: venda.quantidade,
              forma_pagto: venda.forma_pagto,
              observacao: venda.observacao,
              is_caixa_2: venda.is_caixa_2,
              criado_em: venda.criado_em
            };

            const { error } = await supabase.from('vendas').upsert(payload);
            if (!error) {
              await dbLocal.vendas.update(venda.id, { sync_status: 'synced', sync_action: undefined });
              totalSincronizados++;
            }
          }
        } catch (e) {
          console.error('Erro ao sincronizar venda:', venda.id, e);
        }
      }

      // 3. Sincronizar Uploads de Relatórios Pendentes (PDFs)
      const uploadsPendentes = await dbLocal.storageQueue.toArray();
      for (const uploadItem of uploadsPendentes) {
        try {
          const { error } = await supabase.storage
            .from(uploadItem.bucket)
            .upload(uploadItem.caminho, uploadItem.blob, {
              contentType: uploadItem.contentType,
              upsert: true
            });

          if (!error && uploadItem.id) {
            await dbLocal.storageQueue.delete(uploadItem.id);
            totalSincronizados++;
          }
        } catch (e) {
          console.error('Erro ao sincronizar upload de arquivo:', uploadItem.caminho, e);
        }
      }

      this.lastSyncAt = new Date();
      await this.contarPendentes();
      return { sucesso: true, sincronizados: totalSincronizados };
    } catch (err: any) {
      console.error('Falha geral no processo de sincronização:', err);
      return { sucesso: false, sincronizados: totalSincronizados, erro: err.message || 'Falha ao sincronizar' };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // Helpers para salvar dados no cache local quando lidos da nuvem
  public async cacheSessao(sessao: any) {
    if (!sessao || !sessao.id) return;
    try {
      await dbLocal.sessoes.put({
        id: String(sessao.id),
        unidade: sessao.unidade,
        status: sessao.status,
        troco_inicial: Number(sessao.troco_inicial) || 0,
        caixa_2_ativo: !!sessao.caixa_2_ativo,
        aberto_em: sessao.aberto_em,
        fechado_em: sessao.fechado_em,
        repasse_caixa_2: sessao.repasse_caixa_2,
        sync_status: 'synced'
      });
    } catch (e) {
      console.error('Erro ao salvar sessão em cache local:', e);
    }
  }

  public async cacheVendas(vendasRaw: any[], sessaoId: string) {
    if (!vendasRaw || vendasRaw.length === 0) return;
    try {
      const records: LocalVenda[] = vendasRaw.map(v => ({
        id: String(v.id),
        sessao_id: String(sessaoId),
        unidade: v.unidade,
        numero_sequencial: Number(v.numero_sequencial),
        setor: v.setor,
        valor: Number(v.valor),
        quantidade: Number(v.quantidade || 1),
        forma_pagto: v.forma_pagto,
        observacao: v.observacao || '',
        is_caixa_2: !!v.is_caixa_2,
        criado_em: v.criado_em || new Date().toISOString(),
        sync_status: 'synced'
      }));

      // Inserção em massa rápida no Dexie
      await dbLocal.vendas.bulkPut(records);
    } catch (e) {
      console.error('Erro ao salvar vendas em cache local:', e);
    }
  }
}

export const syncService = new SyncService();

