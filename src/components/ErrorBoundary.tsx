import React from 'react';
import {View} from 'react-native';
import {tw} from '@/core/theme/tw';
import {Button} from './Button';
import {Text} from './Text';

type State = {error: Error | null};

/**
 * A render error must never leave a privacy tool as a blank window the user
 * can't interpret. Show what happened and offer a reload of the UI tree.
 * (Covers and capture protection live in the native layer and keep running.)
 */
export class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error) {
    console.error('[veil] UI error', error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <View style={tw`flex-1 items-center justify-center gap-3 bg-veil-bg p-6`}>
        <Text variant="title">Something went wrong</Text>
        <Text variant="body" tone="muted" className="max-w-[460px] text-center">
          {this.state.error.message}
        </Text>
        <Text variant="small" tone="faint" className="max-w-[460px] text-center">
          Your protection keeps running in the background. Reload the interface to continue.
        </Text>
        <Button
          label="Reload interface"
          variant="primary"
          onPress={() => this.setState({error: null})}
        />
      </View>
    );
  }
}
