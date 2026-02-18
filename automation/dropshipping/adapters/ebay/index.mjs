import { MockEbayAdapter } from './mockEbayAdapter.mjs';
import { LiveEbayAdapter } from './liveEbayAdapter.mjs';

export const createEbayAdapter = ({ mode = 'mock', baseDirUrl } = {}) => {
  if (mode === 'live') {
    return new LiveEbayAdapter();
  }
  return new MockEbayAdapter({ baseDirUrl });
};
