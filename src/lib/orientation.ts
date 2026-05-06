// Курс устройства (heading) — из компаса (DeviceOrientationEvent).
// На iOS 13+ нужно вызывать requestPermission после явного жеста.

import type { LatLng } from './geo';

type HeadingHandler = (heading: number) => void;

type DOEStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

export function needsIosPermission(): boolean {
  const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as DOEStatic | undefined;
  return !!DOE && typeof DOE.requestPermission === 'function';
}

export async function requestIosPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as DOEStatic;
  if (typeof DOE.requestPermission !== 'function') return true;
  try {
    const r = await DOE.requestPermission();
    return r === 'granted';
  } catch {
    return false;
  }
}

export function startHeading(handler: HeadingHandler): () => void {
  const onOrient = (e: DeviceOrientationEvent) => {
    const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let heading: number | null = null;
    if (typeof anyE.webkitCompassHeading === 'number') {
      heading = anyE.webkitCompassHeading;
    } else if (e.absolute && e.alpha !== null) {
      heading = (360 - (e.alpha as number)) % 360;
    }
    if (heading !== null && !Number.isNaN(heading)) handler(heading);
  };
  window.addEventListener('deviceorientationabsolute' as keyof WindowEventMap, onOrient as EventListener);
  window.addEventListener('deviceorientation', onOrient as EventListener);
  return () => {
    window.removeEventListener('deviceorientationabsolute' as keyof WindowEventMap, onOrient as EventListener);
    window.removeEventListener('deviceorientation', onOrient as EventListener);
  };
}

// Курс по последним двум GPS-точкам — это то, что нужно реально
// (DESIGN_SPEC §2: «направление по вектору движения»).
export function bearingFromTrail(prev: LatLng, curr: LatLng): number {
  const lat1 = (prev.lat * Math.PI) / 180;
  const lat2 = (curr.lat * Math.PI) / 180;
  const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
