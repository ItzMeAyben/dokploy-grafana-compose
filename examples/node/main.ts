// Send one OTLP trace, metric, and log to Alloy via HTTPS + basic auth.
// Run with: cp .env.example .env && pnpm install && pnpm start

import "dotenv/config";

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  metrics,
  trace,
} from "@opentelemetry/api";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const serviceName = "node-otel-test";

const {
  ALLOY_ENDPOINT: alloyEndpoint,
  ALLOY_USER: alloyUser,
  ALLOY_PASSWORD: alloyPassword,
  METRIC_VALUE: metricValue = (Math.random() * 100).toFixed(2),
  LOG_MESSAGE: logMessage = `random log ${Math.random().toString(36).slice(2, 10)} @ ${new Date().toISOString()}`,
} = process.env;

if (!alloyEndpoint || !alloyUser || !alloyPassword) {
  console.error(
    "Missing ALLOY_ENDPOINT / ALLOY_USER / ALLOY_PASSWORD — copy .env.example to .env and fill in.",
  );
  process.exit(1);
}

const authToken = Buffer.from(`${alloyUser}:${alloyPassword}`).toString(
  "base64",
);
const headers = { Authorization: `Basic ${authToken}` };

const resource = new Resource({ "service.name": serviceName });

const tracerProvider = new NodeTracerProvider({
  resource,
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: `${alloyEndpoint}/v1/traces`,
        headers,
      }),
    ),
  ],
});
tracerProvider.register();

const meterProvider = new MeterProvider({
  resource,
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${alloyEndpoint}/v1/metrics`,
        headers,
      }),
      exportIntervalMillis: 1_000,
    }),
  ],
});
metrics.setGlobalMeterProvider(meterProvider);

const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        url: `${alloyEndpoint}/v1/logs`,
        headers,
      }),
    ),
  ],
});
logs.setGlobalLoggerProvider(loggerProvider);

async function main() {
  const tracer = trace.getTracer(serviceName);
  const meter = metrics.getMeter(serviceName);
  const logger = logs.getLogger(serviceName);

  const span = tracer.startSpan("correct-timestamp-test", {
    attributes: {
      "http.method": "GET",
      "http.url": "/api/now",
    },
  });
  await new Promise((r) => setTimeout(r, 100));
  span.end();

  const gauge = meter.createGauge("test_temperature");
  gauge.record(Number(metricValue), {
    source: serviceName,
  });

  logger.emit({
    severityText: "INFO",
    body: logMessage,
    attributes: {
      "service.name": serviceName,
      level: "info",
      source: "main.ts",
    },
  });

  await tracerProvider.forceFlush();
  await meterProvider.forceFlush();
  await loggerProvider.forceFlush();

  await tracerProvider.shutdown();
  await meterProvider.shutdown();
  await loggerProvider.shutdown();

  console.log(`Sent trace, metric, log to ${alloyEndpoint}`);
  console.log(`  Tempo:  { .service.name = "${serviceName}" }`);
  console.log(`  Prom:   test_temperature{source="${serviceName}"}`);
  console.log(`  Loki:   {service_name="${serviceName}"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
