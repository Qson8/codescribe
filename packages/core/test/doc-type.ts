import assert from 'node:assert/strict';
import {
  DOC_TYPE_LABELS, DOC_TYPE_REQUIRED_METADATA, DEFAULT_DOC_TYPE,
  isDocumentType, missingMetadata, splitTitle, buildHeaderTitle, validateMetadataFor,
} from '../src/doc-type.ts';

assert.equal(DEFAULT_DOC_TYPE, 'source-program');
assert.ok(isDocumentType('source-program'));
assert.ok(isDocumentType('user-manual'));
assert.ok(isDocumentType('design-spec'));
assert.ok(isDocumentType('application-form'));
assert.equal(isDocumentType('other'), false);
assert.equal(isDocumentType(undefined), false);

assert.equal(DOC_TYPE_LABELS['source-program'], '源程序鉴别材料');
assert.equal(DOC_TYPE_LABELS['user-manual'], '用户手册');

assert.deepEqual(DOC_TYPE_REQUIRED_METADATA['source-program'], ['softwareName', 'version']);
assert.ok(DOC_TYPE_REQUIRED_METADATA['application-form'].includes('owner'));

assert.deepEqual(missingMetadata('user-manual', { softwareName: '测试系统', version: 'V1.0' }), ['description']);
assert.deepEqual(missingMetadata('user-manual', { softwareName: '测试系统' }), ['version', 'description']);
assert.deepEqual(missingMetadata('user-manual', { softwareName: '', version: '  ' }), ['softwareName', 'version', 'description']);

const { softwareName, version } = splitTitle('测试系统 V1.0');
assert.equal(softwareName, '测试系统');
assert.equal(version, '1.0');
assert.deepEqual(splitTitle('无版本号'), { softwareName: '无版本号', version: '' });

assert.equal(buildHeaderTitle({ softwareName: '测试系统', version: 'V1.0' }), '测试系统 V1.0');
assert.equal(buildHeaderTitle({ softwareName: '测试系统', version: '' }), '测试系统');

assert.deepEqual(validateMetadataFor('application-form', { softwareName: 'A', version: '1.0', owner: 'X' }), []);
assert.equal(validateMetadataFor('application-form', { softwareName: 'A', version: '1.0' }).length, 1);

console.log('✅ doc-type 全部通过');