import React, {useState} from 'react';
import {Pressable, View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {Icon, type IconName} from './Icon';
import {Text} from './Text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  className?: string;
};

const variants = {
  primary: {
    box: 'bg-veil-accent border-veil-accent',
    hover: 'bg-veil-accent-hover',
    fg: 'text-white',
    icon: '#FFFFFF',
  },
  secondary: {
    box: 'bg-veil-raised border-veil-line',
    hover: 'bg-veil-hover',
    fg: 'text-veil-text',
    icon: '#EEF1F8',
  },
  ghost: {
    box: 'bg-transparent border-transparent',
    hover: 'bg-veil-raised',
    fg: 'text-veil-muted',
    icon: '#98A2BA',
  },
  danger: {
    box: 'bg-veil-danger/15 border-veil-danger/35',
    hover: 'bg-veil-danger/20',
    fg: 'text-veil-danger',
    icon: '#F87171',
  },
} as const;

export function Button({label, onPress, variant = 'secondary', icon, disabled, className}: Props) {
  const [hover, setHover] = useState(false);
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      // Never forward the press event: callers pass plain actions, not handlers.
      onPress={() => onPress()}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({pressed}) =>
        tw.style(
          'flex-row items-center justify-center gap-2 rounded-xl border px-4 py-2.5',
          v.box,
          (hover || pressed) && v.hover,
          disabled ? 'opacity-45' : pressed && 'opacity-85',
          className,
        )
      }
    >
      {icon ? <Icon name={icon} size={16} color={v.icon} /> : null}
      <Text variant="heading" className={`text-[13px] ${v.fg}`}>
        {label}
      </Text>
    </Pressable>
  );
}

const tones = {
  muted: {box: 'bg-veil-raised', fg: 'text-veil-muted', dot: 'bg-veil-muted'},
  accent: {box: 'bg-veil-accent/15', fg: 'text-veil-accent', dot: 'bg-veil-accent'},
  success: {box: 'bg-veil-success/15', fg: 'text-veil-success', dot: 'bg-veil-success'},
  warn: {box: 'bg-veil-warn/15', fg: 'text-veil-warn', dot: 'bg-veil-warn'},
  danger: {box: 'bg-veil-danger/15', fg: 'text-veil-danger', dot: 'bg-veil-danger'},
} as const;

export function Badge({
  label,
  tone = 'muted',
  dot,
}: {
  label: string;
  tone?: keyof typeof tones;
  dot?: boolean;
}) {
  const t = tones[tone];
  return (
    <View
      style={tw.style('flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1', t.box)}
    >
      {dot ? <View style={tw.style('h-1.5 w-1.5 rounded-full', t.dot)} /> : null}
      <Text variant="small" className={`font-semibold ${t.fg}`}>
        {label}
      </Text>
    </View>
  );
}
