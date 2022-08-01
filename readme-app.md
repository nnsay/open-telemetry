# 1. 准备工作

该文档使用opentelemetry-collector-contrib镜像自建deployment/service等资源, 与使用controller方式相比这么做的优势是:

- 添加云厂商的特殊注解. eg: k8s.aliyun.com/eci-ram-role-name
- 更精细化设置collector pod

## 1.1  Role授权
- 授权日志服务
- 授权日志服务使用的对象存储服务

```json
{
  "Action": "log:*",
  "Effect": "Allow",
  "Resource": "acs:log:*:*:*"
},
{
  "Action": "oss:*",
  "Effect": "Allow",
  "Resource": [
		...
    "acs:oss:*:*:ngiq-cn-*-log",
    "acs:oss:*:*:ngiq-cn-*-log/*"
  ]
},
```



## 1.2 Collector镜像

使用CICD服务上传镜像到阿里云仓库
```bash
docker pull otel/opentelemetry-collector-contrib

docker tag otel/opentelemetry-collector-contrib ngiq-registry-vpc.cn-hangzhou.cr.aliyuncs.com/ngiq-cr/opentelemetry-collector-contrib

aliyun cr GetAuthorizationToken --InstanceId cri-2bp27pwaqbe7w5t2 --force --version 2018-12-01 | jq -r .AuthorizationToken | docker login --username=cr_temp_user --password-stdin ngiq-registry-vpc.cn-hangzhou.cr.aliyuncs.com

docker push ngiq-registry-vpc.cn-hangzhou.cr.aliyuncs.com/ngiq-cr/opentelemetry-collector-contrib
```

# 2. Collector服务

创建collector服务yaml文件opentelemetry-app.yaml, 内容如下:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector
data:
  collector.yaml: |
    receivers:
      zipkin:
        endpoint: "0.0.0.0:9411"
    exporters:
      alibabacloud_logservice/sls-trace:
        endpoint: "cn-hangzhou-intranet.log.aliyuncs.com"   
        project: "ngiq-cn-pnt-log"               
        logstore: "ngiq-cn-pnt-trace-traces"              
        ecs_ram_role: "pnt-CodeRole"
    service:
      pipelines:
        traces:
          receivers: [zipkin]
          exporters: [alibabacloud_logservice/sls-trace]

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
      annotations:
        k8s.aliyun.com/eci-ram-role-name: pnt-CodeRole
        k8s.aliyun.com/eci-image-cache: "true"
    spec:
      volumes:
        - name: otc-internal
          configMap:
            name: otel-collector
            items:
              - key: collector.yaml
                path: collector.yaml
            defaultMode: 420
      containers:
        - name: otel-collector
          image: ngiq-registry.cn-hangzhou.cr.aliyuncs.com/ngiq-cr/opentelemetry-collector-contrib:latest
          args:
            - '--config=/conf/collector.yaml'
          resources:
            limits:
              cpu: '1'
              memory: 2Gi
            requests:
              cpu: '1'
              memory: 1Gi
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          volumeMounts:
            - name: otc-internal
              mountPath: /conf
---

apiVersion: v1
kind: Service
metadata:
  name: otel-collector
spec:
  selector:
    app: otel-collector
  ports:
  - port: 9411
    targetPort: 9411
  type: ClusterIP

---

apiVersion: autoscaling/v2beta1
kind: HorizontalPodAutoscaler
metadata:
  name: otel-collector
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: otel-collector
  minReplicas: 1
  maxReplicas: 3
  metrics:
  - type: Resource
    resource:
      name: memory
      targetAverageUtilization: 70
```
创建collector:

```bash
kubectl -n pnt apply -f opentelemetry-app.yaml
```



以下内容需要按需变化:

- ConfigMap.data.collector.yaml.exporters.alibabacloud_logservice/sls-trace
  - project: 设置为您在创建Trace实例时所选择的Project
  - logstore: 格式为: {trace_instance_id}-traces
  - ecs_ram_role: 需提前设置role有sls和oss的权限
- Deployment
  - metadata.annotations.k8s.aliyun.com/eci-ram-role-name

# 3. 测试结果
- 调用几个开启zipkin的服务

  ```properties
  spring.zipkin.enabled=true
  spring.zipkin.base-url=http://otel-collector:9411/
  ```

- 查看结果

	![image-20220801160121197](https://raw.githubusercontent.com/nnsay/gist/main/img/image-20220801160121197.png)

