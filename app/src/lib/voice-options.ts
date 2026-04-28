/** Badge shown next to a voice name in the dropdown. */
export type VoiceBadge = 'Best female' | 'Best male';

export type VoiceOption = {
  value: string;
  label: string;
  badge?: VoiceBadge;
};

export const VOICE_OPTIONS: VoiceOption[] = [
  // American Female
  { value: 'af_heart', label: 'af_heart', badge: 'Best female' },
  { value: 'af_alloy', label: 'af_alloy' },
  { value: 'af_aoede', label: 'af_aoede' },
  { value: 'af_bella', label: 'af_bella' },
  { value: 'af_jessica', label: 'af_jessica' },
  { value: 'af_kore', label: 'af_kore' },
  { value: 'af_nicole', label: 'af_nicole' },
  { value: 'af_nova', label: 'af_nova' },
  { value: 'af_river', label: 'af_river' },
  { value: 'af_sarah', label: 'af_sarah' },
  { value: 'af_sky', label: 'af_sky' },
  // American Male
  { value: 'am_adam', label: 'am_adam' },
  { value: 'am_echo', label: 'am_echo' },
  { value: 'am_eric', label: 'am_eric' },
  { value: 'am_fenrir', label: 'am_fenrir' },
  { value: 'am_liam', label: 'am_liam' },
  { value: 'am_michael', label: 'am_michael', badge: 'Best male' },
  { value: 'am_onyx', label: 'am_onyx' },
  { value: 'am_puck', label: 'am_puck' },
  { value: 'am_santa', label: 'am_santa' },
];
