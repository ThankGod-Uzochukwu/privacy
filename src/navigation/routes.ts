import {createStore, useStore} from '@/core/store/store';
import type {IconName} from '@/components/Icon';

export type RouteKey = 'dashboard' | 'overlay' | 'peekproof' | 'settings';

export const ROUTES: {key: RouteKey; label: string; icon: IconName}[] = [
  {key: 'dashboard', label: 'Privacy', icon: 'shield'},
  {key: 'overlay', label: 'Overlay', icon: 'opacity'},
  {key: 'peekproof', label: 'Covers', icon: 'layers'},
  {key: 'settings', label: 'Settings', icon: 'settings'},
];

/**
 * Four fixed destinations don't justify a navigation library (and its native
 * dependencies on three desktop renderers). Routes are just state.
 */
const routeStore = createStore<RouteKey>('dashboard');

export const navigate = (r: RouteKey) => routeStore.set(r);
export const useRoute = () => useStore(routeStore, r => r);
