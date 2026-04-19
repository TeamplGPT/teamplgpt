#!/bin/bash
# Docker Image Build + Deploy
# 사용법: ./docker-deploy.sh [DOCKER_USER] [VERSION]
# 예: ./docker-deploy.sh docker-user v1.0.0
# 예: ./docker-deploy.sh (기본값 사용)

# -h 또는 --help 옵션 처리
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  echo "Docker 빌드 & 푸시 스크립트"
  echo ""
  echo "사용법: $0 <DOCKER_USER> [VERSION]"
  echo ""
  echo "파라미터:"
  echo "  DOCKER_USER  Docker 레지스트리 사용자명 (필수)"
  echo "  VERSION      이미지 버전 (기본값: v1.0.0)"
  echo ""
  echo "예시:"
  echo "  $0 docker-user                  # 기본 버전으로 실행"
  echo "  $0 docker-user v2.0.0           # 버전 지정"
  exit 0
fi

# 필수 파라미터 확인
if [ -z "$1" ]; then
  echo "❌ 오류: DOCKER_USER 파라미터가 필요합니다."
  echo ""
  echo "사용법: $0 <DOCKER_USER> [VERSION]"
  echo "예: $0 docker-user"
  echo "예: $0 docker-user v2.0.0"
  echo ""
  echo "도움말: $0 -h"
  exit 1
fi

# 파라미터 설정
DOCKER_USER=$1
VERSION=${2:-v1.0.0}
IMAGE_NAME="anythingllm"
DOCKERFILE_PATH="./docker/Dockerfile"
PLATFORM="linux/amd64"

# 파라미터 확인
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Docker 빌드 설정"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Docker 사용자: $DOCKER_USER"
echo "버전: $VERSION"
echo "이미지: $DOCKER_USER/$IMAGE_NAME:latest, $DOCKER_USER/$IMAGE_NAME:$VERSION"
echo "Dockerfile: $DOCKERFILE_PATH"
echo "플랫폼: $PLATFORM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Dockerfile 존재 확인
if [ ! -f "$DOCKERFILE_PATH" ]; then
  echo "❌ 오류: $DOCKERFILE_PATH 파일을 찾을 수 없습니다."
  exit 1
fi

# 명령어 실행
echo "🔨 빌드 및 푸시 시작..."
echo ""

docker buildx build \
  --platform $PLATFORM \
  -f $DOCKERFILE_PATH \
  -t $DOCKER_USER/$IMAGE_NAME:latest \
  -t $DOCKER_USER/$IMAGE_NAME:$VERSION \
  --push \
  .

# 결과 확인
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 빌드 및 푸시 완료!"
  echo "   이미지: $DOCKER_USER/$IMAGE_NAME:latest"
  echo "   이미지: $DOCKER_USER/$IMAGE_NAME:$VERSION"
else
  echo ""
  echo "❌ 빌드 또는 푸시 실패"
  exit 1
fi
