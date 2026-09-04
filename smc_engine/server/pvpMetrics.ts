type Profile = 'PRODUCTION' | 'PVP_ACCELERATION';
const counts: Record<Profile, number> = { PRODUCTION: 0, PVP_ACCELERATION: 0 };
let deliverySuccess = 0;
let deliveryFailure = 0;
let htfSuccess = 0;
let htfFailure = 0;

export function recordSignalVolume(profile: Profile): void {
  counts[profile] += 1;
  console.log(`[PVP Signal Volume] ${JSON.stringify({ profile, production: counts.PRODUCTION, acceleration: counts.PVP_ACCELERATION, total: counts.PRODUCTION + counts.PVP_ACCELERATION })}`);
}

export function recordNotificationDelivery(success: boolean): void {
  if (success) deliverySuccess += 1;
  else deliveryFailure += 1;
  const total = deliverySuccess + deliveryFailure;
  console.log(`[PVP Delivery Metrics] ${JSON.stringify({ deliverySuccessRate: total ? deliverySuccess / total : 0, deliverySuccess, deliveryFailure, pendingNotifications: deliveryFailure })}`);
}

export function record4hAttachment(success: boolean): void {
  if (success) htfSuccess += 1;
  else htfFailure += 1;
  const total = htfSuccess + htfFailure;
  console.log(`[PVP 4H Visualization Metrics] ${JSON.stringify({ screenshotSuccess: htfSuccess, screenshotFailure: htfFailure, attachmentDeliveryRate: total ? htfSuccess / total : 0 })}`);
}
