import React from 'react';
import {Pressable, View} from 'react-native';
import {actions, useApp} from '@/core/store/appStore';
import type {Mode} from '@/core/store/settings';
import {useBreakpoint} from '@/core/responsive/useBreakpoint';
import {palette, tw} from '@/core/theme/tw';
import {Icon, type IconName} from './Icon';
import {Text} from './Text';

const MODES: {key: Mode; title: string; blurb: string; icon: IconName}[] = [
  {
    key: 'shield',
    title: 'Shield',
    blurb: 'Nobody can screenshot or record Veil. Capture shortcuts are blocked.',
    icon: 'shield',
  },
  {
    key: 'cover',
    title: 'Cover',
    blurb: 'Runs over your apps. Screenshots work, but the areas you cover stay hidden.',
    icon: 'layers',
  },
];

/** The two-in-one switch: Shield (lock the app down) or Cover (hide parts of the screen). */
export function ModeSwitch({dense}: {dense?: boolean}) {
  const mode = useApp(s => s.settings.mode);
  const {isCompact} = useBreakpoint();
  const stacked = isCompact && !dense;

  return (
    <View
      accessibilityRole="radiogroup"
      style={tw.style(stacked ? 'flex-col gap-3' : 'flex-row gap-3')}
    >
      {MODES.map(m => {
        const on = m.key === mode;
        return (
          <Pressable
            key={m.key}
            accessibilityRole="radio"
            accessibilityLabel={`${m.title} mode`}
            accessibilityState={{selected: on}}
            onPress={() => actions.setMode(m.key)}
            style={tw.style(
              'min-w-0 flex-row items-center border',
              stacked ? '' : 'flex-1',
              dense ? 'gap-2 rounded-xl p-2' : 'gap-3 rounded-2xl p-4',
              on ? 'border-veil-accent bg-veil-accent/15' : 'border-veil-border bg-veil-surface',
            )}
          >
            <View
              style={tw.style(
                'h-[38px] w-[38px] items-center justify-center rounded-[11px]',
                on ? 'bg-veil-accent' : 'bg-veil-raised',
              )}
            >
              <Icon name={m.icon} size={dense ? 16 : 20} color={on ? '#FFFFFF' : palette.muted} />
            </View>
            <View style={tw`min-w-0 flex-1`}>
              <Text variant="heading" tone={on ? 'default' : 'muted'}>
                {m.title}
              </Text>
              {dense ? null : (
                <Text variant="small" tone="muted" className="mt-0.5 leading-[17px]">
                  {m.blurb}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
