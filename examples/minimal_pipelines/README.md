With this example, can run:
```
$ TARGET_ACCOUNT=account1 npm run -- cdk ls
account1-mystack-pipeline
account1-mystack-pipeline/account1/example
```

This shows the pipeline stack and the deployment stack.

Further, can run:

```
$ npm run -- pipelines-apply
Not doing anything without --apply flag. Would run the following:
git checkout main && TARGET_ACCOUNT="account1" AWS_PROFILE="pipelines-admin" npm run -- cdk deploy --require-approval never -e account1-mystack-pipeline && git checkout -
git checkout development && TARGET_ACCOUNT="account2" AWS_PROFILE="pipelines-admin" npm run -- cdk deploy --require-approval never -e account2-mystack-pipeline && git checkout -
```

This allows synchronising of the pipelines.
