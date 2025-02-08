#!/bin/sh
sudo systemctl start docker
docker stop postgres
docker rm postgres
