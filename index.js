/**
 * Entry point for the native hosts (Windows + macOS) via Metro.
 * The Linux/Electron build uses web/main.tsx instead and shares everything in src/.
 *
 * @format
 */
import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
