import React from 'react';
import {View} from 'react-native';
import {Badge, Button} from '@/components/Button';
import {Card} from '@/components/Card';
import {Columns, Screen} from '@/components/Layout';
import {SettingRow} from '@/components/SettingRow';
import {Text} from '@/components/Text';
import type {Support} from '@/core/native/types';
import {actions, useApp} from '@/core/store/appStore';
import {DEFAULT_SETTINGS} from '@/core/store/settings';
import {tw} from '@/core/theme/tw';

const platformName = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  web: 'Browser',
  unknown: 'Unknown',
} as const;

const supportBadge = (s: Support | boolean) => {
  const v = s === true ? 'full' : s === false ? 'none' : s;
  return v === 'full'
    ? ({label: 'Full', tone: 'success'} as const)
    : v === 'partial'
    ? ({label: 'Partial', tone: 'warn'} as const)
    : ({label: 'None', tone: 'danger'} as const);
};

export function SettingsScreen() {
  const s = useApp(st => st.settings);
  const caps = useApp(st => st.capabilities);

  const captureOk = (caps?.captureProtection ?? 'none') !== 'none';
  const shortcutOk = (caps?.shortcutBlocking ?? 'none') !== 'none';

  const rows: [string, Support | boolean][] = caps
    ? [
        ['Hide window from capture', caps.captureProtection],
        ['Block capture shortcuts', caps.shortcutBlocking],
        ['Always on top', caps.alwaysOnTop],
        ['Window opacity', caps.windowOpacity],
        ['Covers over other apps', caps.maskWindows],
        ['Global hotkey', caps.globalHotkey],
        ['Black out on capture', caps.autoBlackout],
      ]
    : [];

  const primary = (
    <>
      <Card title="Protection">
        <View>
          <SettingRow
            title="Hide this window from capture"
            description="Asks the OS to leave Veil out of screenshots and screen recordings made by other apps."
            value={s.hideFromCapture}
            disabled={!captureOk}
            unavailable={captureOk ? undefined : 'Not supported by this platform.'}
            onValueChange={v => actions.patch({hideFromCapture: v})}
          />
          <SettingRow
            title="Block capture shortcuts"
            description="While Veil is focused, Print Screen, snipping and recording shortcuts do nothing."
            value={s.blockShortcuts}
            disabled={!shortcutOk}
            unavailable={shortcutOk ? undefined : 'Not supported by this platform.'}
            onValueChange={v => actions.patch({blockShortcuts: v})}
            last
          />
        </View>
      </Card>

      <Card title="Cover mode">
        <View>
          <SettingRow
            title="Keep the control panel out of screenshots"
            description="In Cover mode screenshots are allowed, but this window itself stays hidden from them."
            value={s.hidePanelInCover}
            disabled={!captureOk}
            unavailable={captureOk ? undefined : 'Not supported by this platform.'}
            onValueChange={v => actions.patch({hidePanelInCover: v})}
            last
          />
        </View>
      </Card>

      <Card title="Data">
        <Text variant="small" tone="muted" className="leading-[18px]">
          Settings are stored only on this device. Veil makes no network connections and collects
          nothing.
        </Text>
        <View style={tw`flex-row`}>
          <Button
            label="Reset to defaults"
            variant="danger"
            onPress={() => actions.hydrate(DEFAULT_SETTINGS)}
          />
        </View>
      </Card>
    </>
  );

  const secondary = (
    <>
      <Card
        title="This platform"
        subtitle="What Veil can enforce here."
        accessory={caps ? <Badge label={platformName[caps.platform]} tone="accent" /> : undefined}
      >
        <View>
          {rows.map(([label, v], i) => {
            const b = supportBadge(v);
            return (
              <View
                key={label}
                style={tw.style(
                  'flex-row items-center justify-between py-3',
                  i < rows.length - 1 && 'border-b border-veil-border',
                )}
              >
                <Text variant="body" className="min-w-0 flex-1">
                  {label}
                </Text>
                <Badge label={b.label} tone={b.tone} />
              </View>
            );
          })}
        </View>
      </Card>

      <Card title="Good to know" tint="warn">
        <View style={tw`gap-2`}>
          {(caps?.notes ?? []).map(n => (
            <Text key={n} variant="small" tone="muted" className="leading-[18px]">
              • {n}
            </Text>
          ))}
          <Text variant="small" tone="muted" className="leading-[18px]">
            • No software can stop someone photographing your screen with a camera, or a capture
            card on the display output. Veil protects against screenshots and screen-recording
            software.
          </Text>
        </View>
      </Card>
    </>
  );

  return (
    <Screen title="Settings" subtitle="Fine-tune protection and see what this system supports.">
      <Columns primary={primary} secondary={secondary} />
    </Screen>
  );
}
