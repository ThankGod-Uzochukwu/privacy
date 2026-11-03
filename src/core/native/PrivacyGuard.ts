/**
 * Type-only entry so TypeScript can resolve `./PrivacyGuard`. At bundle time
 * the platform file wins: `.native.ts` for Metro (Windows, macOS) and
 * `.web.ts` for Vite (Linux / Electron) – see metro.config.js and
 * web/vite.config.ts. This file is never the one that runs.
 */
import type {PrivacyGuardApi} from './types';

declare const PrivacyGuard: PrivacyGuardApi;
export default PrivacyGuard;
