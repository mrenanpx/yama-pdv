import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabaseClient';
import { dbLocal, type LocalVenda } from '../db/localDb';

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

      // Checagem periódica real a cada 15 segundos
      this.intervalId = setInterval(() => {
        this.verificarEAtualizar();
      }, 15000);

      // Verificação inicial rápida
      setTimeout(() => {
        this.verificarEAtualizar();
      }, 500);
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

  public reportarStatusRede(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.notify();
    }
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
    if (!online) {
      this.isOnline = false;
      this.notify();
      return;
    }
    const conectado = await this.testarConexao();
    if (conectado) {
      await this.sincronizar();
    }
  }

  public async contarPendentes(): Promise<number> {
    try {
      const pendentesVendas = await dbLocal.vendas.where('sync_status').equals('pending').count();
      const pendentesSessoes = await dbLocal.sessoes.where('sync_status').equals('pending').count();
      const pendentesUploads = await dbLocal.storageQueue.count();
      this.pendingCount = pendentesVendas + pendentesSessoes + pendentesUploads;
      this.notify();
      return this.pendingCount;
    } catch {
      return 0;
    }
  }

  public async testarConexao(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.isOnline = false;
      this.notify();
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      // Ping HTTP direto ao endpoint REST do Supabase com no-store e timeout de 3s.
      // Detecta quedas reais da operadora mesmo quando o roteador local continua ligado.
      const response = await fetch(`${SUPABASE_URL}/rest/v1/caixa_sessoes?select=id&limit=1`, {
        method: 'HEAD',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      this.isOnline = response.status >= 200 && response.status < 500;
      this.notify();
      return this.isOnline;
    } catch {
      this.isOnline = false;
      this.notify();
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async verificarEAtualizar() {
    await this.contarPendentes();
    const onlineAgora = await this.testarConexao();

    if (onlineAgora && this.pendingCount > 0 && !this.isSyncing) {
      await this.sincronizar();
    }
  }

  public async sincronizar(): Promise<{ sucesso: boolean; sincronizados: number; erro?: string }> {
    if (this.isSyncing) {
      return { sucesso: true, sincronizados: 0 };
    }

    const conectado = await this.testarConexao();
    if (!conectado) {
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

          const { data: jaExiste, error: errBusca } = await supabase
            .from('caixa_sessoes')
            .select('id')
            .eq('id', sessao.id);

          if (!errBusca) {
            let errOperacao: any = null;
            if (jaExiste && jaExiste.length > 0) {
              const { error } = await supabase
                .from('caixa_sessoes')
                .update({
                  status: sessao.status,
                  troco_inicial: sessao.troco_inicial,
                  caixa_2_ativo: sessao.caixa_2_ativo,
                  ...(sessao.fechado_em ? { fechado_em: sessao.fechado_em } : {}),
                  ...(sessao.repasse_caixa_2 !== undefined ? { repasse_caixa_2: sessao.repasse_caixa_2 } : {})
                })
                .eq('id', sessao.id);
              errOperacao = error;
            } else {
              const { error } = await supabase.from('caixa_sessoes').insert([payload]);
              if (error && error.code === '23505') {
                errOperacao = null;
              } else {
                errOperacao = error;
              }
            }

            if (!errOperacao) {
              await dbLocal.sessoes.update(sessao.id, { sync_status: 'synced' });
              totalSincronizados++;
            }
          }
        } catch (e) {
          console.error('Erro ao sincronizar sessão:', sessao.id, e);
        }
      }

      // 2. Sincronizar Vendas Pendentes (Inserts e Cancelamentos)
      const vendasPendentes = await dbLocal.vendas.where('sync_status').equals('pending').toArray();
      for (const venda of vendasPendentes) {
        try {
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

          if (venda.sync_action === 'cancel') {
            const { data: atualizadas, error } = await supabase
              .from('vendas')
              .update({ forma_pagto: 'CANCELADO', observacao: venda.observacao })
              .eq('id', venda.id)
              .select('id');

            if (!error) {
              // Se a venda foi criada e cancelada enquanto estava offline (ainda não existia no Supabase), insere já como CANCELADO
              if (!atualizadas || atualizadas.length === 0) {
                const { error: errInsertCancel } = await supabase.from('vendas').insert([payload]);
                if (!errInsertCancel || errInsertCancel.code === '23505') {
                  await dbLocal.vendas.update(venda.id, { sync_status: 'synced', sync_action: undefined });
                  totalSincronizados++;
                }
              } else {
                await dbLocal.vendas.update(venda.id, { sync_status: 'synced', sync_action: undefined });
                totalSincronizados++;
              }
            }
          } else {
            // Inserção normal
            const { error } = await supabase.from('vendas').insert([payload]);
            if (!error || error.code === '23505') {
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

  // Helpers para salvar dados no cache local quando lidos da nuvem, protegendo registros 'pending'
  public async cacheSessao(sessao: any) {
    if (!sessao || !sessao.id) return;
    try {
      const idStr = String(sessao.id);
      const localExistente = await dbLocal.sessoes.get(idStr);
      if (localExistente && localExistente.sync_status === 'pending') {
        return;
      }

      await dbLocal.sessoes.put({
        id: idStr,
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
      const sessaoIdStr = String(sessaoId);
      const pendentesLocais = await dbLocal.vendas
        .where('sessao_id')
        .equals(sessaoIdStr)
        .and(v => v.sync_status === 'pending')
        .toArray();
      const idsPendentes = new Set(pendentesLocais.map(v => String(v.id)));

      const records: LocalVenda[] = vendasRaw
        .filter(v => !idsPendentes.has(String(v.id)))
        .map(v => ({
          id: String(v.id),
          sessao_id: sessaoIdStr,
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

      if (records.length > 0) {
        await dbLocal.vendas.bulkPut(records);
      }
    } catch (e) {
      console.error('Erro ao salvar vendas em cache local:', e);
    }
  }
}

export const syncService = new SyncService();
