# 0. 说明

该文档参考阿里云教程使用opentelemetry-operator-manager进行collector的创建和维护, 该方式和直接使用collector镜像方式大同小异, 只是manager本质是controller, 无法在创建云资源的时候附加特殊的注解信息, 例如k8s.aliyun.com/eci-ram-role-name. 所以collector的ecs_ram_role方式跑不通, 但可以使用ak/as方式进行配置collector. **该方式未完整测试**.

# 1. 安装 Operator

- 安装cert-manager

  ```
  wget --no-check-certificate https://github.com/jetstack/cert-manager/releases/download/v1.6.1/cert-manager.yaml

  kubectl apply -f cert-manager.yaml
  ```

- 部署OpenTelemetry Operator

  ```
  wget --no-check-certificate https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

  sed -i 's/ghcr.io\/open-telemetry/sls-registry.cn-beijing.cr.aliyuncs.com/' opentelemetry-operator.yaml
  sed -i 's/0.56.0/v0.45.0/' opentelemetry-operator.yaml
  sed -i 's/gcr.io\/kubebuilder\/kube-rbac-proxy:v0.11.0/registry-vpc.cn-hangzhou.aliyuncs.com\/acs\/kube-rbac-proxy:v0.11.0-703dc7e4-aliyun/' opentelemetry-operator.yaml

  kubectl apply -f opentelemetry-operator.yaml
  ```

- 部署OpenTelemetry Collector

  创建opentelemetry-collector.yaml, 内容如下:
  ```
  apiVersion: opentelemetry.io/v1alpha1
  kind: OpenTelemetryCollector
  metadata:
  name: otel
  namespace: pnt
  spec:
  image: otel/opentelemetry-collector-contrib:latest
  config: |
    receivers:
      zipkin:
        endpoint: "0.0.0.0:9411"
    exporters:
      logging/detail:
        loglevel: debug
      alibabacloud_logservice/sls-trace:
        endpoint: "cn-hangzhou.log.aliyuncs.com"   
        project: "ngiq-cn-pnt-log"               
        logstore: "ngiq-cn-pnt-trace-traces"              
        # ecs_ram_role: "pnt-CodeRole"
        access_key_id: "${access-key-id}"
      	access_key_secret: "${access-key-secret}"
  
    service:
      pipelines:
        traces:
          receivers: [zipkin]
          exporters: [alibabacloud_logservice/sls-trace]
  ```
  以下内容修改:
  - spec.config.exporters.*.project: 设置为您在创建Trace实例时所选择的Project
  - spec.config.exporters.*.ecs_ram_role: 需提前设置role有sls和oss的权限
  - spec.config.exporters.*.logstore: 创建Trace实例后，日志服务自动在您所选择的Project下生成3个Logstore，分别用于存储Logs、Metrics和Traces数据。请根据实际情况替换Logstore名称。
    - trace_instance_id-logs
    - trace_instance_id-traces-metrics
    - trace_instance_id-traces

    其中trace_instance_id为Trace实例ID

  创建collector:
  ```
  kubectl apply -f opentelemetry-collector.yaml
  ```
  
- 重置
```
kubectl delete -f opentelemetry-instrument.yaml
kubectl delete -f opentelemetry-collector.yaml

kubectl apply -f opentelemetry-operator.yaml
kubectl apply -f opentelemetry-collector.yaml
```


# 2. 应用配置

- 容器配置环境变量
```
spring.zipkin.enabled=true
spring.zipkin.base-url=http://otel-collector:9411/
```

# 3. 参考资料
- [接入OpenTelemetry Trace数据](https://help.aliyun.com/document_detail/208915.html)
- [如何在Kubernetes集群中自动安装OpenTelemetry探针](https://help.aliyun.com/document_detail/378116.html)
- [OpenTelemetry Collector安装问题工单](https://smartservice.console.aliyun.com/service/chat?spm=5176.smartservice_service_list.0.0.3023709a8zIp6m&id=0003Y5YJCP)