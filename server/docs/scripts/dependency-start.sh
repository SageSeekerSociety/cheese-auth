#!/bin/sh
sudo systemctl start docker.service

docker run -d \
    --name postgres \
    -e POSTGRES_PASSWORD=postgres \
    --health-cmd="pg_isready" \
    --health-interval=10s \
    --health-timeout=5s \
    --health-retries=5 \
    -p 5432:5432 \
    postgres
echo "Wait for 5 seconds please..."
sleep 5
docker exec -i postgres bash << EOF
    sed -i -e 's/max_connections = 100/max_connections = 1000/' /var/lib/postgresql/data/postgresql.conf
    sed -i -e 's/shared_buffers = 128MB/shared_buffers = 2GB/' /var/lib/postgresql/data/postgresql.conf
EOF
docker restart --time 0 postgres
