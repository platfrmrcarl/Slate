// OpenTelemetry bootstrap. Next.js auto-calls `register()` on server boot.
// Gated on OTEL_ENABLED=true so dev / test runs don't spin up the SDK.
export async function register(): Promise<void> {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import(
    "@opentelemetry/auto-instrumentations-node"
  );
  const { Resource } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
    "@opentelemetry/semantic-conventions"
  );
  const { TraceExporter } = await import("@google-cloud/opentelemetry-cloud-trace-exporter");

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: "wpkiller",
      [ATTR_SERVICE_VERSION]: process.env.WPK_VERSION ?? "0.0.0",
      "deployment.environment": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new TraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });
  sdk.start();
}
