import React from 'react';
import {ScrollView, View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {useBreakpoint} from '@/core/responsive/useBreakpoint';
import {Text} from './Text';

type ScreenProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
};

/** Scrollable page with a header and a centred, width-capped body. */
export function Screen({title, subtitle, right, children}: ScreenProps) {
  const {isCompact} = useBreakpoint();
  return (
    <ScrollView
      style={tw`min-w-0 flex-1`}
      contentContainerStyle={tw.style('items-center', isCompact ? 'p-4 pb-10' : 'p-8 pb-14')}
      showsVerticalScrollIndicator={false}
    >
      <View style={tw`w-full max-w-content gap-6`}>
        <View style={tw`flex-row items-start gap-4`}>
          <View style={tw`min-w-0 flex-1`}>
            <Text variant={isCompact ? 'title' : 'display'}>{title}</Text>
            {subtitle ? (
              <Text variant="body" tone="muted" className="mt-1">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

type ColumnsProps = {primary: React.ReactNode; secondary?: React.ReactNode};

/**
 * Two columns when the window is wide, one stacked column otherwise.
 * Primary content always comes first when stacked.
 */
export function Columns({primary, secondary}: ColumnsProps) {
  const {isExpanded} = useBreakpoint();
  if (!isExpanded || !secondary) {
    return (
      <View style={tw`gap-4`}>
        {primary}
        {secondary}
      </View>
    );
  }
  return (
    <View style={tw`flex-row items-start gap-4`}>
      <View style={tw`min-w-0 flex-3 gap-4`}>{primary}</View>
      <View style={tw`min-w-0 flex-2 gap-4`}>{secondary}</View>
    </View>
  );
}

export function Row({children, wrap}: {children: React.ReactNode; wrap?: boolean}) {
  return (
    <View style={tw.style('flex-row items-center gap-3', wrap && 'flex-wrap')}>{children}</View>
  );
}
