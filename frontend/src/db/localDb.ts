import Dexie, { type Table } from 'dexie';

export interface LocalVenda {
  id: string; // UUID
  sessao_id: string;
  unidade: string;
  numero_sequencial: number;
  setor: string;
  valor: number;
  quantidade: number;
  forma_pagto: string;
  observacao: string;
  is_caixa_2: boolean;
  criado_em: string;
  sync_status: 'synced' | 'pending';
  sync_action?: 'insert' | 'cancel';
}

export interface LocalSessao {
  id: string;
  unidade: string;
  status: 'ABERTO' | 'FECHADO';
  troco_inicial: number;
  caixa_2_ativo: boolean;
  aberto_em: string;
  fechado_em?: string;
  repasse_caixa_2?: number;
  sync_status: 'synced' | 'pending';
}

export interface LocalStorageQueue {
  id?: number;
  bucket: string;
  caminho: string;
  blob: Blob;
  contentType: string;
  criado_em: string;
}

export class YamaPDVDatabase extends Dexie {
  vendas!: Table<LocalVenda, string>;
  sessoes!: Table<LocalSessao, string>;
  storageQueue!: Table<LocalStorageQueue, number>;

  constructor() {
    super('YamaPDVLocalDB');
    this.version(1).stores({
      vendas: 'id, sessao_id, unidade, numero_sequencial, sync_status, criado_em',
      sessoes: 'id, unidade, status, aberto_em, sync_status',
      storageQueue: '++id, bucket, caminho, criado_em'
    });
  }
}

export const dbLocal = new YamaPDVDatabase();

