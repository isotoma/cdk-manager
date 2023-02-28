#!/bin/bash -e

stack_name="$1"-mystack-pipeline
if [[ -n "$2" ]]; then
    stack_name="$stack_name-$2"
fi

npm run -- cdk synth "$stack_name"
