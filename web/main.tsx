/**
 * Web entry for the Linux (Electron) build. It renders the very same
 * src/App.tsx the Windows and macOS hosts run, through react-native-web.
 */
import {AppRegistry} from 'react-native';
import App from '../src/App';

AppRegistry.registerComponent('Veil', () => App);
AppRegistry.runApplication('Veil', {rootTag: (globalThis as any).document.getElementById('root')});
