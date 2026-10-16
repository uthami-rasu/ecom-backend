import { InitialSchema1792040071796 } from './1792040071796-InitialSchema.js';
import { ProductSearchIndex1792040071797 } from './1792040071797-ProductSearchIndex.js';
import { EmailOtpAndOrderTracking1792046729995 } from './1792046729995-EmailOtpAndOrderTracking.js';
import { StoreSettings1792046730000 } from './1792046730000-StoreSettings.js';

// Register every migration here (oldest first). Explicit imports keep the list working
// from both TypeScript sources (tests) and compiled output (CLI / production).
export const migrations: Function[] = [
  InitialSchema1792040071796,
  ProductSearchIndex1792040071797,
  EmailOtpAndOrderTracking1792046729995,
  StoreSettings1792046730000,
];
