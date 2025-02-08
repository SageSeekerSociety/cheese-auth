#!/bin/sh
sudo systemctl start docker
docker restart postgres
