FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -DskipTests dependency:go-offline
COPY src src
RUN mvn -B -DskipTests clean package \
    && test -f /app/target/app.jar

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*
ENV STOCKFISH_PATH=/usr/games/stockfish
# Chạy bằng user thường: nếu engine hoặc ứng dụng bị khai thác thì cũng không
# ghi đè được app.jar hay file hệ thống.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin chess
COPY --from=build /app/target/app.jar app.jar
USER chess
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
