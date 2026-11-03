import React from 'react';
import {View} from 'react-native';
import {actions, useApp} from '@/core/store/appStore';
import {HOTKEY_LABEL} from '@/core/native/constants';
import {palette, tw} from '@/core/theme/tw';
import {Button} from './Button';
import {OpacityControl} from './OpacityControl';
import {Switch} from './Switch';
import {Text} from './Text';

/**
 * The few controls you need while actually working in Cover mode: switch
 * covers on, add one, and fade them. Shared by the dashboard and the HUD.
 */
export function CoverControls({showOpacity = true}: {showOpacity?: boolean}) {
  const on = useApp(s => s.settings.peekProof);
  const count = useApp(s => s.settings.masks.length);
  const opacity = useApp(s => s.settings.maskOpacity);
  const caps = useApp(s => s.capabilities);
  const supported = caps?.maskWindows ?? false;

  return (
    <View style={tw`gap-3`}>
      <View style={tw`flex-row items-center gap-3`}>
        <View style={tw`min-w-0 flex-1`}>
          <Text variant="heading">Covers {on ? 'on' : 'off'}</Text>
          <Text variant="small" tone="muted">
            {count === 0 ? 'No covers yet' : `${count} cover${count === 1 ? '' : 's'}`}
            {caps?.globalHotkey ? ` · ${HOTKEY_LABEL[caps.platform]} toggles` : ''}
          </Text>
        </View>
        <Switch
          value={on}
          disabled={!supported}
          onValueChange={v => actions.patch({peekProof: v})}
          accessibilityLabel="Covers"
        />
      </View>

      <Button
        label="Add cover"
        icon="plus"
        variant="primary"
        disabled={!supported}
        onPress={() => actions.addMask()}
      />

      {showOpacity ? (
        <OpacityControl
          label="Cover opacity"
          value={opacity}
          color={palette.cyan}
          disabled={!supported}
          onChange={v => actions.patch({maskOpacity: v})}
        />
      ) : null}
    </View>
  );
}
