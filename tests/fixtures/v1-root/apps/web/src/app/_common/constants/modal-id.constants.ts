export type ModalIdKeys = keyof typeof modalIds;
export type ModalId = (typeof modalIds)[ModalIdKeys];
export const modalIds = {
  userSettings: 'USER_SETTINGS',
} as const;
