import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=readFileSync(new URL('../../docs/AP4F3U_GC_OWNER_JIS_DRAFT_CONTRACT.md',import.meta.url),'utf8');
test('document discloses both GC project override and Form19 formula authority',()=>{
  for(const phrase of ['gcContactInfo.generalEmail','gcContactInfo.streetAddress','gcContactInfo.cityStateZip',
    'projectOwnerInfo.name','Owner.OwnerEmail','Form140 master','GCSuperintendent.GCSuperMobile',
    'NO CONFIRMED FORM19 DESTINATION','GC_REASSIGNMENT_REQUIRES_CONTACT_REVIEW',
    'SetupState=PENDING_SETUP','No Cognito create POST']) assert.ok(d.includes(phrase),phrase);
});
