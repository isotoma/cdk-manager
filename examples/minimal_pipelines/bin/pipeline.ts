#!/usr/bin/env node
import 'source-map-support/register';
import { manager } from '../lib/manager';

if (!process.env['NO_SYNTH']) {
    manager.getPipelineCdkAppFromEnv();
}
