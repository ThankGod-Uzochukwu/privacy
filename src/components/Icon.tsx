/* eslint-disable react-native/no-inline-styles -- glyph geometry is derived from `size`, so these styles are inherently dynamic */
import React from 'react';
import {View} from 'react-native';
import {palette, tw} from '@/core/theme/tw';

export type IconName =
  | 'shield'
  | 'layers'
  | 'opacity'
  | 'settings'
  | 'plus'
  | 'trash'
  | 'lock'
  | 'unlock'
  | 'pin'
  | 'check'
  | 'alert';

type Props = {name: IconName; size?: number; color?: string};

/**
 * Icons are drawn from plain Views so they render identically on every
 * renderer (Fabric/Windows, legacy/macOS, react-native-web) with no font
 * files, SVG library or native linking. Each glyph lives on a 24-unit grid.
 */
export function Icon({name, size = 18, color = palette.muted}: Props) {
  const u = size / 24;
  const stroke = Math.max(1.5, 2 * u);
  const box = {width: size, height: size};

  switch (name) {
    case 'shield':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 16 * u,
              height: 19 * u,
              borderWidth: stroke,
              borderColor: color,
              borderTopLeftRadius: 4 * u,
              borderTopRightRadius: 4 * u,
              borderBottomLeftRadius: 9 * u,
              borderBottomRightRadius: 9 * u,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 5 * u,
              height: 8 * u,
              borderRightWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: color,
              transform: [{rotate: '45deg'}, {translateY: -1 * u}],
            }}
          />
        </View>
      );
    case 'layers':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 14 * u,
              height: 14 * u,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: 3 * u,
              backgroundColor: color,
              opacity: 0.9,
              position: 'absolute',
              right: 2 * u,
              bottom: 2 * u,
            }}
          />
          <View
            style={{
              width: 14 * u,
              height: 14 * u,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: 3 * u,
              backgroundColor: palette.bg,
              position: 'absolute',
              left: 2 * u,
              top: 2 * u,
            }}
          />
        </View>
      );
    case 'opacity':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 18 * u,
              height: 18 * u,
              borderRadius: 9 * u,
              borderWidth: stroke,
              borderColor: color,
              overflow: 'hidden',
              flexDirection: 'row',
            }}
          >
            <View style={{width: '50%', backgroundColor: color}} />
          </View>
        </View>
      );
    case 'settings':
      return (
        <View style={[box, center]}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: (4 + i * 6) * u,
                left: 3 * u,
                width: 18 * u,
                height: stroke,
                borderRadius: stroke,
                backgroundColor: color,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -2.5 * u,
                  left: (i === 1 ? 10 : i === 0 ? 3 : 12) * u,
                  width: 6 * u,
                  height: 6 * u,
                  borderRadius: 3 * u,
                  backgroundColor: palette.bg,
                  borderWidth: stroke,
                  borderColor: color,
                }}
              />
            </View>
          ))}
        </View>
      );
    case 'plus':
      return (
        <View style={[box, center]}>
          <View
            style={{
              position: 'absolute',
              width: 14 * u,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
          <View
            style={{
              position: 'absolute',
              height: 14 * u,
              width: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </View>
      );
    case 'trash':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 12 * u,
              height: 13 * u,
              marginTop: 4 * u,
              borderWidth: stroke,
              borderColor: color,
              borderBottomLeftRadius: 3 * u,
              borderBottomRightRadius: 3 * u,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 4 * u,
              width: 17 * u,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 2 * u,
              width: 6 * u,
              height: stroke,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </View>
      );
    case 'lock':
    case 'unlock':
      return (
        <View style={[box, center]}>
          <View
            style={{
              position: 'absolute',
              top: 2 * u,
              width: 10 * u,
              height: 10 * u,
              borderWidth: stroke,
              borderColor: color,
              borderTopLeftRadius: 5 * u,
              borderTopRightRadius: 5 * u,
              borderBottomWidth: 0,
              left: (name === 'lock' ? 7 : 11) * u,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 10 * u,
              width: 16 * u,
              height: 11 * u,
              borderRadius: 3 * u,
              backgroundColor: color,
            }}
          />
        </View>
      );
    case 'pin':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 11 * u,
              height: 11 * u,
              borderRadius: 6 * u,
              backgroundColor: color,
              position: 'absolute',
              top: 3 * u,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 13 * u,
              width: stroke,
              height: 8 * u,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </View>
      );
    case 'check':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 7 * u,
              height: 12 * u,
              borderRightWidth: stroke * 1.2,
              borderBottomWidth: stroke * 1.2,
              borderColor: color,
              transform: [{rotate: '45deg'}, {translateY: -1.5 * u}],
            }}
          />
        </View>
      );
    case 'alert':
      return (
        <View style={[box, center]}>
          <View
            style={{
              width: 18 * u,
              height: 18 * u,
              borderRadius: 9 * u,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: stroke,
                height: 7 * u,
                backgroundColor: color,
                borderRadius: stroke,
                marginBottom: 1.5 * u,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 3 * u,
                width: stroke,
                height: stroke,
                backgroundColor: color,
                borderRadius: stroke,
              }}
            />
          </View>
        </View>
      );
  }
}

const center = tw`items-center justify-center`;
