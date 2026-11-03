import React, {useState} from 'react';
import {Pressable, View} from 'react-native';
import {Icon} from '@/components/Icon';
import {Text} from '@/components/Text';
import type {SizeClass} from '@/core/responsive/useBreakpoint';
import {palette, tw} from '@/core/theme/tw';
import {navigate, ROUTES, useRoute} from './routes';

/** Sidebar (expanded), icon rail (medium) or bottom bar (compact). */
export function NavBar({size}: {size: SizeClass}) {
  const route = useRoute();

  if (size === 'compact') {
    return (
      <View style={tw`flex-row gap-1 border-t border-veil-border bg-veil-surface p-1`}>
        {ROUTES.map(r => (
          <Item key={r.key} r={r} active={route === r.key} layout="bottom" />
        ))}
      </View>
    );
  }

  const wide = size === 'expanded';
  return (
    <View
      style={tw.style(
        'gap-6 border-r border-veil-border bg-veil-surface p-3',
        wide ? 'w-[232px]' : 'w-[84px] items-center',
      )}
    >
      <Brand showText={wide} />
      <View style={tw`gap-1 self-stretch`}>
        {ROUTES.map(r => (
          <Item key={r.key} r={r} active={route === r.key} layout={wide ? 'row' : 'rail'} />
        ))}
      </View>
    </View>
  );
}

function Brand({showText}: {showText: boolean}) {
  return (
    <View
      style={tw.style('flex-row items-center gap-3 pt-2', showText ? 'px-2' : 'justify-center')}
    >
      <View style={tw`h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-veil-accent`}>
        <Icon name="shield" size={18} color="#FFFFFF" />
      </View>
      {showText ? (
        <View>
          <Text variant="heading" className="text-base tracking-wide">
            Veil
          </Text>
          <Text variant="small" tone="faint">
            Screen privacy
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Item({
  r,
  active,
  layout,
}: {
  r: (typeof ROUTES)[number];
  active: boolean;
  layout: 'row' | 'rail' | 'bottom';
}) {
  const [hover, setHover] = useState(false);
  const color = active ? palette.accent : palette.muted;
  const compact = layout !== 'row';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={r.label}
      accessibilityState={{selected: active}}
      onPress={() => navigate(r.key)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={tw.style(
        'rounded-xl',
        layout === 'row' && 'flex-row items-center gap-3 px-3 py-2.5',
        layout === 'rail' && 'items-center gap-1 py-2.5',
        layout === 'bottom' && 'flex-1 items-center gap-[3px] py-2',
        active ? 'bg-veil-accent/15' : hover && 'bg-veil-raised',
      )}
    >
      <Icon name={r.icon} size={compact ? 20 : 18} color={color} />
      <Text
        variant={layout === 'row' ? 'heading' : 'small'}
        className={`${active ? 'text-veil-text' : 'text-veil-muted'} ${
          compact ? 'text-[10.5px]' : 'text-[13.5px]'
        }`}
      >
        {r.label}
      </Text>
    </Pressable>
  );
}
