import React, {useMemo} from 'react';
import {View} from 'react-native';
import {Badge, Button} from '@/components/Button';
import {Card} from '@/components/Card';
import {CoverControls} from '@/components/CoverControls';
import {Icon} from '@/components/Icon';
import {Columns, Screen} from '@/components/Layout';
import {ModeSwitch} from '@/components/ModeSwitch';
import {Switch} from '@/components/Switch';
import {Text} from '@/components/Text';
import {enterHud} from '@/core/engine/window';
import {actions, useApp} from '@/core/store/appStore';
import {palette, tw} from '@/core/theme/tw';
import {navigate} from '@/navigation/routes';
import {
  computeProtections,
  headline,
  type Headline,
  type Protection,
  type ProtectionState,
} from './status';

type Look = {hex: string; border: string; soft: string; title: string; body: string};

const looks: Record<Headline, Look> = {
  secure: {
    hex: palette.success,
    border: 'border-veil-success',
    soft: 'bg-veil-success/15',
    title: 'You’re protected',
    body: 'Screenshots and recordings can’t see this window, and capture shortcuts are blocked while you’re in Veil.',
  },
  partial: {
    hex: palette.warn,
    border: 'border-veil-warn',
    soft: 'bg-veil-warn/15',
    title: 'Partly protected',
    body: 'Some protections are off or only partly supported on this system. Review the list below.',
  },
  exposed: {
    hex: palette.danger,
    border: 'border-veil-danger',
    soft: 'bg-veil-danger/15',
    title: 'Not protected',
    body: 'The shield is off. Turn it on to hide this window from capture and block capture shortcuts.',
  },
  covering: {
    hex: palette.cyan,
    border: 'border-veil-cyan',
    soft: 'bg-veil-cyan/15',
    title: 'Covering your screen',
    body: 'Your covers float over every app. Take a screenshot as usual — whatever is under a cover comes out black.',
  },
  ready: {
    hex: palette.accent,
    border: 'border-veil-accent',
    soft: 'bg-veil-accent/15',
    title: 'Ready to cover',
    body: 'Add a cover, drag it over anything sensitive, then switch covers on.',
  },
  unsupported: {
    hex: palette.danger,
    border: 'border-veil-danger',
    soft: 'bg-veil-danger/15',
    title: 'Covers unavailable',
    body: 'This platform can’t create the floating windows covers need.',
  },
  unknown: {
    hex: palette.muted,
    border: 'border-veil-line',
    soft: 'bg-veil-raised',
    title: 'Checking your system…',
    body: 'Detecting what this platform can enforce.',
  },
};

const badge: Record<
  ProtectionState,
  {label: string; tone: 'success' | 'warn' | 'muted' | 'danger'}
> = {
  active: {label: 'Active', tone: 'success'},
  partial: {label: 'Partial', tone: 'warn'},
  off: {label: 'Off', tone: 'muted'},
  unsupported: {label: 'Unavailable', tone: 'danger'},
};

export function DashboardScreen() {
  const settings = useApp(s => s.settings);
  const caps = useApp(s => s.capabilities);
  const log = useApp(s => s.log);
  const blocked = useApp(s => s.blockedCount);
  const attempts = useApp(s => s.attemptCount);

  const protections = useMemo(() => computeProtections(settings, caps), [settings, caps]);
  const h = looks[headline(settings, caps)];
  const shieldMode = settings.mode === 'shield';

  const primary = (
    <>
      <ModeSwitch />

      <View style={tw.style('gap-4 rounded-xxl border bg-veil-surface p-6', h.border)}>
        <View style={tw`flex-row items-center gap-4`}>
          <View
            style={tw.style(
              'h-16 w-16 items-center justify-center rounded-full border-[1.5px]',
              h.soft,
              h.border,
            )}
          >
            <Icon name={shieldMode ? 'shield' : 'layers'} size={34} color={h.hex} />
          </View>
          <View style={tw`min-w-0 flex-1`}>
            <Text variant="title">{h.title}</Text>
            <Text variant="body" tone="muted" className="mt-1 leading-[19px]">
              {h.body}
            </Text>
          </View>
          {shieldMode ? (
            <View style={tw`items-center gap-1`}>
              <Switch
                value={settings.shield}
                onValueChange={v => actions.patch({shield: v})}
                accessibilityLabel="Privacy shield"
              />
              <Text variant="small" tone="faint">
                {settings.shield ? 'Shield on' : 'Shield off'}
              </Text>
            </View>
          ) : null}
        </View>

        {shieldMode ? null : (
          <>
            <View style={tw`h-px bg-veil-border`} />
            <CoverControls />
            <View style={tw`flex-row flex-wrap gap-3`}>
              <Button label="Arrange covers" icon="layers" onPress={() => navigate('peekproof')} />
              {caps?.alwaysOnTop ? (
                <Button label="Shrink to floating bar" icon="pin" onPress={() => enterHud()} />
              ) : null}
            </View>
          </>
        )}
      </View>

      <Card
        title="What’s happening"
        subtitle="Live status, based on what this operating system can enforce."
      >
        <View>
          {protections.map((p, i) => (
            <ProtectionRow key={p.key} p={p} last={i === protections.length - 1} />
          ))}
        </View>
      </Card>
    </>
  );

  const secondary = (
    <>
      {shieldMode ? (
        <View style={tw`flex-row gap-3`}>
          <Stat label="Shortcuts blocked" value={blocked} color={palette.accent} />
          <Stat label="Capture attempts" value={attempts} color={palette.cyan} />
        </View>
      ) : (
        <View style={tw`flex-row gap-3`}>
          <Stat label="Covers" value={settings.masks.length} color={palette.cyan} />
          <Stat label="Screenshots detected" value={attempts} color={palette.warn} />
        </View>
      )}

      <Card
        title="Recent activity"
        subtitle="Capture shortcuts Veil has seen this session."
        accessory={
          log.length ? (
            <Button label="Clear" variant="ghost" onPress={() => actions.clearLog()} />
          ) : undefined
        }
      >
        {log.length === 0 ? (
          <View style={tw`flex-row items-center gap-3 py-2`}>
            <Icon name="check" size={20} color={palette.faint} />
            <Text variant="small" tone="faint" className="min-w-0 flex-1">
              Nothing yet. Attempts to capture your screen will appear here.
            </Text>
          </View>
        ) : (
          <View>
            {log.slice(0, 8).map(e => (
              <View key={e.id} style={tw`flex-row items-center gap-3 py-[7px]`}>
                <Badge
                  label={e.kind === 'blocked' ? 'Blocked' : 'Detected'}
                  tone={e.kind === 'blocked' ? 'success' : 'warn'}
                  dot
                />
                <Text variant="mono" className="min-w-0 flex-1" numberOfLines={1}>
                  {e.combo}
                </Text>
                <Text variant="small" tone="faint">
                  {new Date(e.at).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );

  return (
    <Screen title="Privacy" subtitle="Keep what’s on your screen on your screen.">
      <Columns primary={primary} secondary={secondary} />
    </Screen>
  );
}

function ProtectionRow({p, last}: {p: Protection; last: boolean}) {
  const b = badge[p.state];
  return (
    <View
      style={tw.style('flex-row items-center gap-4 py-3', !last && 'border-b border-veil-border')}
    >
      <View style={tw`min-w-0 flex-1`}>
        <Text variant="heading">{p.title}</Text>
        <Text variant="small" tone="muted" className="mt-0.5 leading-[17px]">
          {p.detail}
        </Text>
      </View>
      <Badge label={b.label} tone={b.tone} dot />
    </View>
  );
}

function Stat({label, value, color}: {label: string; value: number; color: string}) {
  return (
    <View
      style={tw`min-w-0 flex-1 gap-0.5 rounded-2xl border border-veil-border bg-veil-surface p-4`}
    >
      <Text variant="display" style={{color}}>
        {value}
      </Text>
      <Text variant="small" tone="muted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
