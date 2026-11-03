import React, {useMemo, useRef, useState} from 'react';
import {PanResponder, View, type LayoutChangeEvent} from 'react-native';
import {Text} from '@/components/Text';
import {tw} from '@/core/theme/tw';
import type {Rect} from '@/core/native/types';
import type {Mask} from '@/core/store/settings';
import {clampMove, clampResize, mapScale, toRect} from './geometry';

type Props = {
  bounds: Rect;
  masks: Mask[];
  selectedId: string | null;
  locked: boolean;
  /** 0..1 – previews how strongly masks cover content. */
  opacity: number;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: Rect) => void;
};

const HANDLE = 18;
const MAX_MAP_HEIGHT = 340;

/**
 * A miniature of the desktop. Every blackout region is a draggable /
 * resizable box; moves are mirrored to the real on-screen mask in real time
 * by the engine, and moves of the real mask (dragged natively) flow back here.
 */
export function ScreenMap({bounds, masks, selectedId, locked, opacity, onSelect, onChange}: Props) {
  const [width, setWidth] = useState(0);
  const scale = mapScale(width, bounds, MAX_MAP_HEIGHT);
  const mapW = bounds.width * scale;
  const mapH = bounds.height * scale;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={tw`w-full items-center`}>
      <View
        style={[
          tw`overflow-hidden rounded-xl border border-veil-line bg-veil-raised`,
          {width: mapW, height: mapH},
        ]}
      >
        <View
          pointerEvents="none"
          style={tw`absolute left-0 right-0 top-1/2 h-px bg-veil-border`}
        />
        <View
          pointerEvents="none"
          style={tw`absolute bottom-0 top-0 left-1/2 w-px bg-veil-border`}
        />
        {/* click on empty desktop = deselect */}
        <View
          style={tw`absolute inset-0`}
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => onSelect(null)}
        />
        <Text
          variant="small"
          tone="faint"
          className="absolute bottom-1.5 right-2"
          pointerEvents="none"
        >
          {Math.round(bounds.width)} × {Math.round(bounds.height)}
        </Text>
        {masks.map(m => (
          <MaskBox
            key={m.id}
            mask={m}
            bounds={bounds}
            scale={scale}
            selected={m.id === selectedId}
            locked={locked}
            opacity={opacity}
            onSelect={onSelect}
            onChange={onChange}
          />
        ))}
      </View>
    </View>
  );
}

type BoxProps = {
  mask: Mask;
  bounds: Rect;
  scale: number;
  selected: boolean;
  locked: boolean;
  opacity: number;
  onSelect: (id: string) => void;
  onChange: (id: string, rect: Rect) => void;
};

function MaskBox({mask, bounds, scale, selected, locked, opacity, onSelect, onChange}: BoxProps) {
  const live = useRef({mask, bounds, scale, locked, onSelect, onChange});
  live.current = {mask, bounds, scale, locked, onSelect, onChange};
  const origin = useRef<Rect>(toRect(mask));

  const move = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.locked,
        onMoveShouldSetPanResponder: () => !live.current.locked,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          origin.current = toRect(live.current.mask);
          live.current.onSelect(live.current.mask.id);
        },
        onPanResponderMove: (_, g) => {
          const c = live.current;
          if (c.scale <= 0) {
            return;
          }
          const next = clampMove(
            {
              ...origin.current,
              x: origin.current.x + g.dx / c.scale,
              y: origin.current.y + g.dy / c.scale,
            },
            c.bounds,
          );
          c.onChange(c.mask.id, next);
        },
      }),
    [],
  );

  const resize = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.locked,
        onMoveShouldSetPanResponder: () => !live.current.locked,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          origin.current = toRect(live.current.mask);
          live.current.onSelect(live.current.mask.id);
        },
        onPanResponderMove: (_, g) => {
          const c = live.current;
          if (c.scale <= 0) {
            return;
          }
          c.onChange(
            c.mask.id,
            clampResize(origin.current, g.dx / c.scale, g.dy / c.scale, c.bounds),
          );
        },
      }),
    [],
  );

  return (
    <View
      {...move.panHandlers}
      accessibilityLabel={`${mask.label}, ${Math.round(mask.width)} by ${Math.round(mask.height)}`}
      style={[
        tw.style(
          'absolute items-center justify-center rounded border-[1.5px]',
          selected ? 'border-veil-accent' : 'border-veil-line',
          locked && 'border-dashed',
        ),
        {
          left: (mask.x - bounds.x) * scale,
          top: (mask.y - bounds.y) * scale,
          width: mask.width * scale,
          height: mask.height * scale,
          backgroundColor: `rgba(0,0,0,${Math.max(0.55, opacity)})`,
        },
      ]}
    >
      <Text variant="small" numberOfLines={1} pointerEvents="none" tone="muted" className="px-1">
        {mask.label}
      </Text>
      {!locked && selected ? (
        <View
          {...resize.panHandlers}
          // Kept inside the box: hit-testing outside a parent's bounds is not
          // reliable across native renderers.
          style={[
            tw`absolute bottom-0.5 right-0.5 items-center justify-center rounded-full border-2 border-veil-bg bg-veil-accent`,
            {width: HANDLE, height: HANDLE},
          ]}
        >
          <View style={tw`h-1.5 w-1.5 border-b border-r border-white`} />
        </View>
      ) : null}
    </View>
  );
}
