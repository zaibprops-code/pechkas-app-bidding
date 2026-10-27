import { router } from 'expo-router';
import { Trouble } from '../src/components/Trouble';

/**
 * A link to a page the app does not have: an old notification, a link from
 * a message, a page that has since moved. Said plainly, with the way home,
 * instead of the router's own grey developer page.
 */
export default function NotFound() {
  return <Trouble kind="missing" full onHome={() => router.replace('/')} />;
}
