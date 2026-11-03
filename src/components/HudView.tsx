import React from 'react';
import {ScrollView, View} from 'react-native';
import {exitHud} from '@/core/engine/window';
import {actions, useApp} from '@/core/store/appStore';
import {MIN_WINDOW_OPACITY} from '@/core/native/constants';
import {tw} from '@/core/theme/tw';
import {Button} from './Button';
import {CoverControls} from './CoverControls';
import {Icon} from './Icon';
import {ModeSwitch} from './ModeSwitch';
import {OpacityControl} from './OpacityControl';
import {Switch} from './Switch';
import {Text} from './Text';

/**
 * Floating-bar layout, shown whenever the window is narrower than the HUD
 * breakpoint (e.g. after "Shrink to floating bar"). Only the controls you need
 * while working in other apps: mode, the on/off switch, and opacity.
 */
export function HudView() {
  const mode = useApp(s => s.settings.mode);
  const shield = useApp(s => s.settings.shield);
  const winOpacity = useApp(s => s.settings.windowOpacity);
  const canOpacity = useApp(s => s.capabilities?.windowOpacity ?? false);

  return (
    <ScrollView
      style={tw`flex-1 bg-veil-bg`}
      contentContainerStyle={tw`gap-3 p-3`}
      showsVerticalScrollIndicator={false}
    >
      <View style={tw`flex-row items-center gap-2`}>
        <View style={tw`h-6 w-6 items-center justify-center rounded-[7px] bg-veil-accent`}>
          <Icon name="shield" size={14} color="#FFFFFF" />
        </View>
        <Text variant="heading" className="min-w-0 flex-1">
          Veil
        </Text>
        <Button label="Expand" variant="ghost" onPress={exitHud} />
      </View>

      <ModeSwitch dense />

      {mode === 'cover' ? (
        <CoverControls />
      ) : (
        <View
          style={tw`flex-row items-center gap-3 rounded-xl border border-veil-border bg-veil-surface p-3`}
        >
          <View style={tw`min-w-0 flex-1`}>
            <Text variant="heading">Shield {shield ? 'on' : 'off'}</Text>
            <Text variant="small" tone="muted">
              {shield ? 'Capture blocked' : 'Capture allowed'}
            </Text>
          </View>
          <Switch
            value={shield}
            onValueChange={v => actions.patch({shield: v})}
            accessibilityLabel="Shield"
          />
        </View>
      )}

      <OpacityControl
        label="Window opacity"
        value={winOpacity}
        min={MIN_WINDOW_OPACITY}
        disabled={!canOpacity}
        onChange={v => actions.patch({windowOpacity: v})}
      />
    </ScrollView>
  );
}
