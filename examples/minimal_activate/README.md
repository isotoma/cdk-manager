With this example, can run:
```
$ npm run -- activate
export AWS_PROFILE="account1-Admin"
export TARGET_ACCOUNT="account1"
export AWS_REGION="eu-west-2"
export AWS_SDK_LOAD_CONFIG="1"
export FOO_IS_ENABLED="yes"
```

See `--help` on this command for more.

This shows the activate output. This output is expected to be used with `source`, eg:
```
$ source <(npm run -- activate)
```
