import React from 'react';
import {ActivityIndicator, StatusBar, View} from 'react-native';
import {ErrorBoundary} from '@/components/ErrorBoundary';
import {HudView} from '@/components/HudView';
import {TitleBar} from '@/components/TitleBar';
import {useEngine} from '@/core/engine/useEngine';
import {useBreakpoint} from '@/core/responsive/useBreakpoint';
import {useApp} from '@/core/store/appStore';
import {palette, tw} from '@/core/theme/tw';
import {DashboardScreen} from '@/features/dashboard/DashboardScreen';
import {OverlayScreen} from '@/features/overlay/OverlayScreen';
import {PeekProofScreen} from '@/features/peekproof/PeekProofScreen';
import {SettingsScreen} from '@/features/settings/SettingsScreen';
import {NavBar} from '@/navigation/NavBar';
import {useRoute, type RouteKey} from '@/navigation/routes';

const SCREENS: Record<RouteKey, React.ComponentType> = {
  dashboard: DashboardScreen,
  overlay: OverlayScreen,
  peekproof: PeekProofScreen,
  settings: SettingsScreen,
};

export default function App() {
  useEngine();
  const ready = useApp(s => s.ready);
  const route = useRoute();
  const {size, isHud} = useBreakpoint();
  const Screen = SCREENS[route];
  const compact = size === 'compact';

  return (
    <ErrorBoundary>
      <View style={tw`flex-1 bg-veil-bg`}>
        <StatusBar barStyle="light-content" backgroundColor={palette.bg} />
        <TitleBar />
        {!ready ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : isHud ? (
          <HudView />
        ) : (
          <View style={tw.style('flex-1', compact ? 'flex-col' : 'flex-row')}>
            {!compact ? <NavBar size={size} /> : null}
            <View style={tw`min-h-0 min-w-0 flex-1`}>
              <Screen />
            </View>
            {compact ? <NavBar size={size} /> : null}
          </View>
        )}
      </View>
    </ErrorBoundary>
  );
}
