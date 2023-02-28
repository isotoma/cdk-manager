With this example, can run:
```
$ npm run -- bootstrapper
Not doing anything with --apply flag. Would run the following:
NO_SYNTH="yes" AWS_PROFILE="account1-Admin" npm run -- cdk bootstrap aws://1234/eu-west-2 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
NO_SYNTH="yes" AWS_PROFILE="account1-Admin" npm run -- cdk bootstrap aws://1234/us-east-1 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
NO_SYNTH="yes" AWS_PROFILE="account2-Admin" npm run -- cdk bootstrap aws://2345/eu-west-2 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
NO_SYNTH="yes" AWS_PROFILE="account2-Admin" npm run -- cdk bootstrap aws://2345/us-east-1 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
NO_SYNTH="yes" AWS_PROFILE="pipelines-Admin" npm run -- cdk bootstrap aws://3456/eu-west-2 --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

This shows the commands to bootstrap these accounts and regions.

See `--help` on this command for more.
