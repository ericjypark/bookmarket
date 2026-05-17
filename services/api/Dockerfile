# syntax=docker/dockerfile:1.7

FROM maven:3.9.9-eclipse-temurin-11 AS builder
WORKDIR /workspace

COPY services/api/pom.xml ./pom.xml
RUN mvn -B -DskipTests dependency:go-offline

COPY services/api ./
RUN mvn -B -DskipTests package

FROM eclipse-temurin:11-jre-jammy AS runner
WORKDIR /app

RUN groupadd --system bookmarket \
  && useradd --system --gid bookmarket --home-dir /app --no-create-home --shell /usr/sbin/nologin bookmarket

COPY --from=builder /workspace/target/api-0.1.0-SNAPSHOT.jar /app/app.jar

USER bookmarket
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
