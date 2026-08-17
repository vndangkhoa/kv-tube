'use client';

import { useEffect, useState } from 'react';

// OrientationGuard keeps the *browsing UI* in portrait. On phones, when the
// device is rotated to landscape we show a full-screen overlay asking the user
// to rotate back — unless a video is playing, in which case the player itself
// goes fullscreen landscape (see SelfHostedPlayer). We do NOT call
// screen.orientation.lock so the player is free to rotate.
export default function OrientationGuard() {
    return null;
}
