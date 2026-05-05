type W = Window &
  typeof globalThis & {
    DeviceOrientationEvent: typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
  };

type OrientEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };

export type HeadingListener = (deg: number) => void;

export function watchHeading(onHeading: HeadingListener): () => void {
  let last: number | null = null;
  const handler = (raw: Event) => {
    const e = raw as OrientEvt;
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') {
      h = e.webkitCompassHeading;
    } else if (e.alpha != null) {
      h = (360 - e.alpha) % 360;
    }
    if (h == null) return;
    if (last != null) {
      const delta = ((h - last + 540) % 360) - 180;
      h = last + delta * 0.25;
      h = (h + 360) % 360;
    }
    last = h;
    onHeading(h);
  };
  const evtName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evtName, handler as EventListener, true);
  return () => window.removeEventListener(evtName, handler as EventListener, true);
}

export async function requestOrientationPermission(): Promise<boolean> {
  const w = window as W;
  const req = w.DeviceOrientationEvent?.requestPermission;
  if (typeof req !== 'function') return true;
  try {
    return (await req()) === 'granted';
  } catch {
    return false;
  }
}
