import React from 'react';
import {Platform, Pressable, View} from 'react-native';
import PrivacyGuard from '@/core/native';
import {useApp} from '@/core/store/appStore';
import {tw} from '@/core/theme/tw';
import {Text} from './Text';

// Electron reads this CSS property to decide which part of a frameless window drags it.
const drag = (on: boolean) =>
  Platform.OS === 'web' ? ({WebkitAppRegion: on ? 'drag' : 'no-drag'} as object) : null;

/**
 * Only rendered when the host window has no chrome of its own (Linux/Electron
 * uses a transparent frameless window so opacity works). Windows and macOS use
 * the real system title bar.
 */
export function TitleBar() {
  const custom = useApp(s => s.capabilities?.customChrome ?? false);
  if (!custom) {
    return null;
  }
  return (
    <View
      style={[
        tw`h-[34px] flex-row items-center justify-between border-b border-veil-border bg-veil-surface pl-4`,
        drag(true),
      ]}
    >
      <Text variant="small" tone="muted" className="font-semibold tracking-wide" style={drag(true)}>
        Veil
      </Text>
      <View style={[tw`flex-row`, drag(false)]}>
        <Ctl label="Minimize" glyph="–" onPress={() => PrivacyGuard.windowControl('minimize')} />
        <Ctl label="Maximize" glyph="□" onPress={() => PrivacyGuard.windowControl('maximize')} />
        <Ctl label="Close" glyph="✕" danger onPress={() => PrivacyGuard.windowControl('close')} />
      </View>
    </View>
  );
}

function Ctl({
  label,
  glyph,
  onPress,
  danger,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={tw.style(
        'h-[34px] w-[46px] items-center justify-center',
        hover && (danger ? 'bg-veil-danger' : 'bg-veil-raised'),
      )}
    >
      <Text variant="small" className={hover && danger ? 'text-white' : 'text-veil-muted'}>
        {glyph}
      </Text>
    </Pressable>
  );
}
