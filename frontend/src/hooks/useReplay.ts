import { useState } from 'react';
import { client, ApiClientError } from '../api/client';

export function useReplay() {
  const [isReplaying, setIsReplaying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const startReplay = async () => {
    try {
      setIsReplaying(true);
      await client.replay();
    } catch (err: any) {
      setIsReplaying(false);
      if (err instanceof ApiClientError && err.code === 'REPLAY_ALREADY_APPLIED') {
        showToast('Already replayed. Press Reset to run it again.');
      } else if (err instanceof ApiClientError && err.code === 'REPLAY_IN_PROGRESS') {
        showToast('Replay in progress…');
      } else {
        showToast(err.message || 'Failed to start replay');
      }
    }
  };

  const resetDemo = async () => {
    try {
      setIsReplaying(false);
      await client.reset();
    } catch (err: any) {
      showToast(err.message || 'Failed to reset demo');
    }
  };

  return {
    isReplaying,
    startReplay,
    resetDemo,
    toastMessage,
    clearToast: () => setToastMessage(null),
  };
}

