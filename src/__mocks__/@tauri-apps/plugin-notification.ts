export const sendNotification = vi.fn()
export const isPermissionGranted = vi.fn(() => Promise.resolve(true))
export const requestPermission = vi.fn(() => Promise.resolve('granted'))
