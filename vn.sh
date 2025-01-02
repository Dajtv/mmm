#!/bin/bash
echo "start scan max speed"
zmap -p 10001 -w vt.txt --rate=1000000000 --cooldown-time=10 | ./prox -p 10001