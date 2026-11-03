import React, {useEffect, useState} from 'react';
import {Pressable, View} from 'react-native';
import {Badge, Button} from '@/components/Button';
import {Card} from '@/components/Card';
import {Icon} from '@/components/Icon';
import {Columns, Row, Screen} from '@/components/Layout';
import {OpacityControl} from '@/components/OpacityControl';
import {SettingRow} from '@/components/SettingRow';
import {Text} from '@/components/Text';
import {actions, useApp} from '@/core/store/appStore';
import {palette, tw} from '@/core/theme/tw';
import {ScreenMap} from './ScreenMap';

export function PeekProofScreen() {
  const s = useApp(st => st.settings);
  const caps = useApp(st => st.capabilities);
  const bounds = useApp(st => st.bounds);
  const [selected, setSelected] = useState<string | null>(null);

  const supported = caps?.maskWindows ?? false;
  const canAuto = caps?.autoBlackout ?? false;
  const shieldMode = s.mode === 'shield';

  // Drop the selection when its mask disappears.
  useEffect(() => {
    if (selected && !s.masks.some(m => m.id === selected)) {
      setSelected(null);
    }
  }, [s.masks, selected]);

  const primary = (
    <>
      {shieldMode ? (
        <Card
          tint="accent"
          title="Covers show in Cover mode"
          subtitle="You’re in Shield mode, where screenshots are blocked instead. Arrange your covers here any time — switch modes to put them on screen."
          accessory={
            <Button
              label="Switch to Cover mode"
              variant="primary"
              onPress={() => actions.setMode('cover')}
            />
          }
        />
      ) : null}

      <Card
        title="Screen map"
        subtitle={
          supported
            ? 'Drag a region to move it, drag its handle to resize. The real on-screen region follows live.'
            : 'Blackout regions need a native window layer, which this platform doesn’t provide.'
        }
        accessory={
          <Row>
            <Button
              label="Add region"
              icon="plus"
              variant="primary"
              disabled={!supported}
              onPress={() => actions.addMask()}
            />
          </Row>
        }
      >
        <ScreenMap
          bounds={bounds}
          masks={s.masks}
          selectedId={selected}
          locked={s.masksLocked}
          opacity={s.maskOpacity}
          onSelect={setSelected}
          onChange={(id, rect) => actions.updateMask(id, rect)}
        />
        {s.masks.length === 0 ? (
          <View style={tw`rounded-xl bg-veil-raised p-3`}>
            <Text variant="small" tone="muted" className="leading-[18px]">
              No regions yet. Add one, then place it over anything you never want to show up in a
              screenshot — a chat sidebar, a notification area, a password manager.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card
        title="Regions"
        accessory={
          s.masks.length ? (
            <Button
              label="Remove all"
              icon="trash"
              variant="danger"
              onPress={() => actions.clearMasks()}
            />
          ) : undefined
        }
      >
        {s.masks.length === 0 ? (
          <Text variant="small" tone="faint">
            Your blackout regions will be listed here.
          </Text>
        ) : (
          <View>
            {s.masks.map(m => {
              const on = m.id === selected;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${m.label}`}
                  onPress={() => setSelected(on ? null : m.id)}
                  style={tw.style(
                    'flex-row items-center gap-3 rounded-xl px-2 py-3',
                    on && 'bg-veil-accent/15',
                  )}
                >
                  <View
                    style={tw.style(
                      'h-5 w-7 rounded border-[1.5px] bg-black',
                      on ? 'border-veil-accent' : 'border-veil-line',
                    )}
                  />
                  <View style={tw`min-w-0 flex-1 gap-0.5`}>
                    <Text variant="heading">{m.label}</Text>
                    <Text variant="mono" tone="faint">
                      {Math.round(m.width)} × {Math.round(m.height)} at {Math.round(m.x)},{' '}
                      {Math.round(m.y)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.label}`}
                    hitSlop={8}
                    onPress={() => actions.removeMask(m.id)}
                    style={tw`p-2`}
                  >
                    <Icon name="trash" size={16} color={palette.danger} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
    </>
  );

  const secondary = (
    <>
      <Card
        title="Covers"
        subtitle="Covers float above every app, so anything under them is hidden in screenshots too."
        accessory={
          <Badge label={s.peekProof ? 'On' : 'Off'} tone={s.peekProof ? 'success' : 'muted'} dot />
        }
      >
        <View>
          <SettingRow
            title="Covers on"
            description="Show the covers over your apps. Works from anywhere with the global hotkey."
            value={s.peekProof}
            disabled={!supported}
            unavailable={supported ? undefined : 'Not supported by this platform.'}
            onValueChange={v => actions.patch({peekProof: v})}
          />
          <SettingRow
            title="Lock in place"
            description="Regions become click-through and can’t be dragged by accident."
            value={s.masksLocked}
            disabled={!supported}
            onValueChange={v => actions.patch({masksLocked: v})}
          />
          <SettingRow
            title="Black out on capture"
            description={
              canAuto
                ? 'Regions snap to solid black the moment a screenshot or recording hotkey is pressed, then fade back.'
                : 'Not available here – set opacity to 100% to keep regions black at all times.'
            }
            value={s.autoBlackout && canAuto}
            disabled={!supported || !canAuto}
            onValueChange={v => actions.patch({autoBlackout: v})}
            last
          />
        </View>
      </Card>

      <Card title="Region opacity">
        <OpacityControl
          label="Idle opacity"
          value={s.maskOpacity}
          disabled={!supported}
          color={palette.cyan}
          onChange={v => actions.patch({maskOpacity: v})}
          hint={
            canAuto && s.autoBlackout
              ? '0% keeps regions invisible until a capture shortcut fires; they then go fully black.'
              : '100% fully hides what’s underneath, in screenshots as well.'
          }
        />
      </Card>
    </>
  );

  return (
    <Screen
      title="Covers"
      subtitle="Drag black covers over the parts of your screen that must never be captured."
    >
      <Columns primary={primary} secondary={secondary} />
    </Screen>
  );
}
