import { MockSupplierAdapter } from './mockSupplierAdapter.mjs';
import { LiveSupplierAdapter } from './liveSupplierAdapter.mjs';

export const createSupplierAdapter = ({ mode = 'mock', baseDirUrl } = {}) => {
  if (mode === 'live') return new LiveSupplierAdapter();
  return new MockSupplierAdapter({ baseDirUrl });
};
