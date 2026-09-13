import { registerOTel } from '@vercel/otel'

export function register(): void {
  registerOTel({ serviceName: 'studio-zoom' })
}
