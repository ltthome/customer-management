import Dexie, { type Table } from 'dexie';

export interface Customer {
  id?: number;
  fullName: string;
  phone: string;
  note: string;
  customSearchField1: string;
  type: CustomerType;
  lastCall?: Date;
  nextCall?: Date;
}

export enum CustomerType {
	NEW="NEW",
  BUSY="BUSY",
  YES="YES",
  NO="NO",
  TRIAL="TRIAL",
  TEST="TEST",
  FULL="FULL",
  NA="NA"
}


export class MySubClassedDexie extends Dexie {
  customers!: Table<Customer>;

  constructor() {
    super('customerDB');
    this.version(1).stores({
      customers: '++id, fullName, phone, customSearchField1, type, lastCall, nextCall'
    });
  }
}

export const db = new MySubClassedDexie(); 