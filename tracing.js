const opentelemetry = require("@opentelemetry/api");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");
const {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/tracing");
const grpc = require("@grpc/grpc-js");
const {
  CollectorTraceExporter,
} = require("@opentelemetry/exporter-collector-grpc");

const {
  ExpressInstrumentation,
} = require("@opentelemetry/instrumentation-express");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");

var os = require("os");
var hostname = os.hostname();

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "${service}",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: "${environment}",
    [SemanticResourceAttributes.SERVICE_VERSION]: "${version}",
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: "${service.namespace}",
    [SemanticResourceAttributes.HOST_NAME]: hostname,
  }),
});
provider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation({
      ignoreLayersType: [new RegExp("middleware.*")],
    }),
  ],
  tracerProvider: provider,
});

var url = "${endpoint}";
url = "http://localhost:55681"

var logStdout = false;
if (url == "stdout") {
  logStdout = true;
}
var meta = new grpc.Metadata();
meta.add("x-sls-otel-project", "${project}");
meta.add("x-sls-otel-instance-id", "${instance}");
meta.add("x-sls-otel-ak-id", "${access-key-id}");
meta.add("x-sls-otel-ak-secret", "${access-key-secret}");
const collectorOptions = {
  url: url,
  credentials: grpc.credentials.createSsl(),
  metadata: meta,
};
const exporter = new CollectorTraceExporter(collectorOptions);

if (!logStdout) {
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
} else {
  var stdexporter = new ConsoleSpanExporter();
  provider.addSpanProcessor(new SimpleSpanProcessor(stdexporter));
}
provider.register();
var tracer = opentelemetry.trace.getTracer("${service}");

var express = require('express');

var app = express()

app.get('/hello', function (req, res, next) {
    const span = tracer.startSpan('hello');
    span.setAttribute('name', 'toma');
    span.setAttribute('age', '26');
    span.addEvent('invoking doWork');

    res.send("success");

    span.end();
});

var server = app.listen(8079, function () {
  var port = server.address().port;
  console.log("App now running in %s mode on port %d", app.get("env"), port);
});