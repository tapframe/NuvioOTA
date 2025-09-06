import formidable from 'formidable';
import fs from 'fs';
import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

import AdmZip from 'adm-zip';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function uploadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    const runtimeVersion = fields.runtimeVersion?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = fields.commitMessage?.[0] || 'No message provided';
    const releaseNotes = fields.releaseNotes?.[0] || '';

    if (!file || !runtimeVersion || !commitHash) {
      res.status(400).json({ error: 'Missing file, runtime version, or commit hash' });
      return;
    }

    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const updatePath = `updates/${runtimeVersion}`;

    // Store the zipped file as is
    const zipContent = fs.readFileSync(file.filepath);
    const zipFolder = new AdmZip(file.filepath);
    const metadataJsonFile = await ZipHelper.getFileFromZip(zipFolder, 'metadata.json');

    const updateHash = HashHelper.createHash(metadataJsonFile, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);

    const path = await storage.uploadFile(`${updatePath}/${timestamp}.zip`, zipContent);

    await DatabaseFactory.getDatabase().createRelease({
      path,
      runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
      releaseNotes,
      updateId,
    });

    res.status(200).json({ success: true, path });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}
