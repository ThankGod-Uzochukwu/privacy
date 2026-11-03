import React from 'react';
import {Pressable, View} from 'react-native';
import {Badge} from '@/components/Button';
import {Card} from '@/components/Card';
import {Columns, Screen} from '@/components/Layout';
import {OpacityControl} from '@/components/OpacityControl';
import {SettingRow} from '@/components/SettingRow';
import {Text} from '@/components/Text';
import {MIN_WINDOW_OPACITY} from '@/core/native/constants';
import {actions, useApp} from '@/core/store/appStore';
import {tw} from '@/core/theme/tw';

export function OverlayScreen() {
  const s = useApp(st => st.settings);
  const caps = useApp(st => st.capabilities);

  const canOpacity = caps?.windowOpacity ?? false;
  const canTop = caps?.alwaysOnTop ?? false;

  const primary = (
    <Card
      title="Window opacity"
      subtitle="Drag to make Veil see-through so you can keep working behind it."
      accessory={<Badge label={`${Math.round(s.windowOpacity * 100)}%`} tone="accent" />}
    >
      <OpacityControl
        label="Opacity"
        value={s.windowOpacity}
        min={MIN_WINDOW_OPACITY}
        disabled={!canOpacity}
        onChange={v => actions.patch({windowOpacity: v})}
        hint={
          canOpacity
            ? `Never lower than ${Math.round(
                MIN_WINDOW_OPACITY * 100,
              )}% so the window can always be found again.`
            : 'Window opacity isn’t available on this platform.'
        }
      />
      <View style={tw`flex-row flex-wrap gap-2`}>
        {[1, 0.75, 0.5, 0.3].map(p => (
          <Preset
            key={p}
            value={p}
            active={Math.abs(s.windowOpacity - p) < 0.005}
            disabled={!canOpacity}
          />
        ))}
      </View>
    </Card>
  );

  const secondary = (
    <Card title="Behaviour">
      <View>
        <SettingRow
          title="Keep on top of other apps"
          description="Veil floats above every window, permanently, even when another app is focused."
          value={s.alwaysOnTop}
          disabled={!canTop}
          unavailable={canTop ? undefined : 'Not supported by this platform.'}
          onValueChange={v => actions.patch({alwaysOnTop: v})}
          last
        />
      </View>
      <View style={tw`rounded-xl bg-veil-raised p-3`}>
        <Text variant="small" tone="muted" className="leading-[17px]">
          Tip: combine a low opacity with “Keep on top” to use Veil as a see-through HUD in the
          corner of your screen.
        </Text>
      </View>
    </Card>
  );

  return (
    <Screen title="Overlay" subtitle="Make Veil float over your work and fade it out.">
      <Columns primary={primary} secondary={secondary} />
    </Screen>
  );
}

function Preset({value, active, disabled}: {value: number; active: boolean; disabled: boolean}) {
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Set opacity to ${Math.round(value * 100)} percent`}
      onPress={() => actions.patch({windowOpacity: value})}
      style={tw.style(
        'rounded-full border px-4 py-[7px]',
        active ? 'border-veil-accent/45 bg-veil-accent/15' : 'border-veil-border bg-veil-raised',
        disabled && 'opacity-40',
      )}
    >
      <Text variant="small" tone={active ? 'accent' : 'muted'} className="font-semibold">
        {Math.round(value * 100)}%
      </Text>
    </Pressable>
  );
}
